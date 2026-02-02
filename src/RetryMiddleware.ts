import type { FetchClientContext } from "./FetchClientContext.ts";
import type { FetchClientMiddleware } from "./FetchClientMiddleware.ts";

/**
 * Default HTTP methods that are eligible for retry.
 * These are idempotent methods that can be safely retried without side effects.
 */
const DEFAULT_RETRY_METHODS = [
  "GET",
  "HEAD",
  "PUT",
  "DELETE",
  "OPTIONS",
  "TRACE",
];

/**
 * Default HTTP status codes that trigger a retry.
 */
const DEFAULT_RETRY_STATUS_CODES = [
  408, // Request Timeout
  413, // Payload Too Large (rate limiting)
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

/**
 * Configuration options for the retry middleware.
 */
export interface RetryMiddlewareOptions {
  /**
   * Maximum number of retry attempts.
   * @default 2
   */
  limit?: number;

  /**
   * HTTP methods eligible for retry.
   * @default ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE']
   */
  methods?: string[];

  /**
   * HTTP status codes that trigger a retry.
   * @default [408, 413, 429, 500, 502, 503, 504]
   */
  statusCodes?: number[];

  /**
   * Maximum value of Retry-After header to respect, in milliseconds.
   * If Retry-After exceeds this value, the request will not be retried.
   * @default Infinity
   */
  maxRetryAfter?: number;

  /**
   * Maximum backoff delay in milliseconds.
   * @default 30000
   */
  backoffLimit?: number;

  /**
   * Custom delay function that receives the attempt number (0-indexed) and returns delay in ms.
   * If not provided, exponential backoff is used: min(1000 * 2^attempt, backoffLimit)
   */
  delay?: (attemptNumber: number, response?: Response) => number;

  /**
   * Jitter fraction for randomizing delay.
   * For example, 0.1 means +/- 10% randomization.
   * @default 0.1
   */
  jitter?: number;

  /**
   * Custom predicate to determine if a request should be retried.
   * Called after default checks pass. Return true to retry, false to stop.
   */
  shouldRetry?: (
    response: Response,
    attemptNumber: number,
  ) => boolean | Promise<boolean>;

  /**
   * Callback invoked before each retry attempt.
   */
  onRetry?: (
    attemptNumber: number,
    response: Response,
    delayMs: number,
  ) => void;
}

/**
 * Retry middleware that automatically retries failed requests with exponential backoff.
 *
 * @example
 * ```typescript
 * const provider = new FetchClientProvider();
 * provider.useRetry({
 *   limit: 3,
 *   statusCodes: [500, 502, 503, 504],
 *   jitter: 0.1,
 * });
 *
 * const client = provider.getFetchClient();
 * const response = await client.getJSON('/api/data');
 * ```
 */
export class RetryMiddleware {
  readonly #options: {
    limit: number;
    methods: string[];
    statusCodes: number[];
    maxRetryAfter: number;
    backoffLimit: number;
    jitter: number;
    delay?: (attemptNumber: number, response?: Response) => number;
    shouldRetry?: (
      response: Response,
      attemptNumber: number,
    ) => boolean | Promise<boolean>;
    onRetry?: (
      attemptNumber: number,
      response: Response,
      delayMs: number,
    ) => void;
  };

  constructor(options?: RetryMiddlewareOptions) {
    this.#options = {
      limit: options?.limit ?? 2,
      methods: (options?.methods ?? DEFAULT_RETRY_METHODS).map((m) =>
        m.toUpperCase()
      ),
      statusCodes: options?.statusCodes ?? DEFAULT_RETRY_STATUS_CODES,
      maxRetryAfter: options?.maxRetryAfter ?? Infinity,
      backoffLimit: options?.backoffLimit ?? 30000,
      jitter: options?.jitter ?? 0.1,
      delay: options?.delay,
      shouldRetry: options?.shouldRetry,
      onRetry: options?.onRetry,
    };
  }

  /**
   * Creates the middleware function.
   * @returns The middleware function
   */
  public middleware(): FetchClientMiddleware {
    return async (context: FetchClientContext, next: () => Promise<void>) => {
      const method = context.request.method.toUpperCase();

      // Check if method is eligible for retry
      if (!this.#options.methods.includes(method)) {
        await next();
        return;
      }

      let attemptNumber = 0;

      while (true) {
        // Store retry metadata in context for observability
        if (attemptNumber > 0) {
          context.retryAttempt = attemptNumber;
        }

        await next();

        // If no response or we've exhausted retries, stop
        if (!context.response || attemptNumber >= this.#options.limit) {
          break;
        }

        const response = context.response;

        // Check if status code is retryable
        if (!this.#options.statusCodes.includes(response.status)) {
          break;
        }

        // Check custom shouldRetry predicate
        if (this.#options.shouldRetry) {
          const shouldRetry = await this.#options.shouldRetry(
            response,
            attemptNumber,
          );
          if (!shouldRetry) {
            break;
          }
        }

        // Calculate base delay
        let delay = this.#calculateDelay(attemptNumber, response);

        // Check Retry-After header
        const retryAfterDelay = this.#parseRetryAfter(response);
        if (retryAfterDelay !== null) {
          // If Retry-After exceeds maxRetryAfter, don't retry
          if (retryAfterDelay > this.#options.maxRetryAfter) {
            break;
          }
          // Use the larger of computed delay or Retry-After
          delay = Math.max(delay, retryAfterDelay);
        }

        // Invoke onRetry callback
        this.#options.onRetry?.(attemptNumber, response, delay);

        // Wait before retry
        await this.#sleep(delay);

        // Reset response for next attempt
        context.response = null;
        attemptNumber++;
      }
    };
  }

  /**
   * Calculates the delay for a given attempt with exponential backoff and jitter.
   */
  #calculateDelay(attemptNumber: number, response?: Response): number {
    let baseDelay: number;

    if (this.#options.delay) {
      baseDelay = this.#options.delay(attemptNumber, response);
    } else {
      // Default exponential backoff: 1s, 2s, 4s, 8s, ...
      baseDelay = Math.min(
        1000 * Math.pow(2, attemptNumber),
        this.#options.backoffLimit,
      );
    }

    // Apply jitter
    return this.#applyJitter(baseDelay);
  }

  /**
   * Applies jitter to a delay value.
   */
  #applyJitter(delay: number): number {
    if (this.#options.jitter <= 0) {
      return delay;
    }

    const jitterRange = delay * this.#options.jitter;
    // Random value between -jitterRange and +jitterRange
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, Math.round(delay + jitter));
  }

  /**
   * Parses the Retry-After header and returns the delay in milliseconds.
   * Supports both delta-seconds and HTTP-date formats.
   */
  #parseRetryAfter(response: Response): number | null {
    const retryAfter = response.headers.get("Retry-After");
    if (!retryAfter) {
      return null;
    }

    // Try parsing as seconds (integer)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP-date
    const date = Date.parse(retryAfter);
    if (!isNaN(date)) {
      return Math.max(0, date - Date.now());
    }

    return null;
  }

  /**
   * Sleep for the specified number of milliseconds.
   */
  #sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a retry middleware with the given options.
 *
 * @example
 * ```typescript
 * const client = new FetchClient();
 * client.use(createRetryMiddleware({ limit: 3 }));
 * ```
 */
export function createRetryMiddleware(
  options?: RetryMiddlewareOptions,
): FetchClientMiddleware {
  return new RetryMiddleware(options).middleware();
}
