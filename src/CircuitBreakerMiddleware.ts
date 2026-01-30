import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitState,
  groupByDomain,
} from "./CircuitBreaker.ts";
import type { FetchClientMiddleware } from "./FetchClientMiddleware.ts";
import { ProblemDetails } from "./ProblemDetails.ts";

/**
 * Options for the circuit breaker middleware.
 */
export interface CircuitBreakerMiddlewareOptions extends CircuitBreakerOptions {
  /** Whether to throw CircuitOpenError instead of returning 503 (default: false) */
  throwOnOpen?: boolean;
  /** Custom error message when circuit is open */
  errorMessage?: string;
  /**
   * Function to determine if a response is a failure.
   * Default: status >= 500 or status === 429
   */
  isFailure?: (response: Response) => boolean;
}

/**
 * Error thrown when a request is blocked due to an open circuit.
 */
export class CircuitOpenError extends Error {
  /** The group whose circuit is open */
  readonly group: string;
  /** The current circuit state */
  readonly state: CircuitState;
  /** When the circuit was opened (timestamp) */
  readonly openedAt: number;
  /** Suggested retry time in seconds */
  readonly retryAfter: number;

  constructor(
    group: string,
    state: CircuitState,
    openedAt: number,
    retryAfter: number,
    message?: string,
  ) {
    super(message ?? `Circuit breaker is open for ${group}`);
    this.name = "CircuitOpenError";
    this.group = group;
    this.state = state;
    this.openedAt = openedAt;
    this.retryAfter = retryAfter;
  }
}

/**
 * Default function to determine if a response is a failure.
 * Returns true for 5xx server errors and 429 rate limit responses.
 */
function defaultIsFailure(response: Response): boolean {
  return response.status >= 500 || response.status === 429;
}

/**
 * Middleware that implements the circuit breaker pattern.
 *
 * When a service starts failing (5xx errors, timeouts, network errors),
 * the circuit breaker opens and blocks further requests for a period,
 * returning 503 Service Unavailable immediately without hitting the API.
 *
 * @example
 * ```typescript
 * const middleware = new CircuitBreakerMiddleware({
 *   failureThreshold: 5,
 *   openDurationMs: 30000,
 * });
 *
 * provider.useMiddleware(middleware.middleware());
 * ```
 */
export class CircuitBreakerMiddleware {
  readonly #circuitBreaker: CircuitBreaker;
  readonly #throwOnOpen: boolean;
  readonly #errorMessage?: string;
  readonly #isFailure: (response: Response) => boolean;
  readonly #getGroupFunc: (url: string) => string;
  readonly #openDurationMs: number;

  constructor(options?: CircuitBreakerMiddlewareOptions) {
    this.#circuitBreaker = new CircuitBreaker(options);
    this.#throwOnOpen = options?.throwOnOpen ?? false;
    this.#errorMessage = options?.errorMessage;
    this.#isFailure = options?.isFailure ?? defaultIsFailure;
    this.#getGroupFunc = options?.getGroupFunc ?? (() => "global");
    this.#openDurationMs = options?.openDurationMs ?? 30000;
  }

  /**
   * Gets the underlying circuit breaker instance.
   */
  get circuitBreaker(): CircuitBreaker {
    return this.#circuitBreaker;
  }

  /**
   * Creates the middleware function for use with FetchClient.
   *
   * @returns The middleware function
   */
  middleware(): FetchClientMiddleware {
    return async (ctx, next) => {
      const url = ctx.request.url;
      const group = this.#getGroupFunc(url);

      // PRE-REQUEST: Check if circuit allows the request
      if (!this.#circuitBreaker.isAllowed(url)) {
        const timeSinceOpen = this.#circuitBreaker.getTimeSinceOpen(url) ?? 0;
        const retryAfterMs = Math.max(0, this.#openDurationMs - timeSinceOpen);
        const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

        if (this.#throwOnOpen) {
          throw new CircuitOpenError(
            group,
            this.#circuitBreaker.getState(url),
            Date.now() - timeSinceOpen,
            retryAfterSeconds,
            this.#errorMessage,
          );
        }

        // Return synthetic 503 response
        const problem = new ProblemDetails();
        problem.status = 503;
        problem.title = "Service Unavailable";
        problem.detail = this.#errorMessage ??
          `Circuit breaker is open for ${group}. Service may be experiencing issues.`;

        const headers = new Headers({
          "Content-Type": "application/problem+json",
          "Retry-After": String(retryAfterSeconds),
        });

        const response = new Response(JSON.stringify(problem), {
          status: 503,
          statusText: "Service Unavailable",
          headers,
        });

        // Attach problem details like FetchClient does
        Object.assign(response, { problem, data: null });

        ctx.response = response as typeof ctx.response;
        return;
      }

      // EXECUTE REQUEST
      let isNetworkError = false;
      try {
        await next();
      } catch (error) {
        // Network errors count as failures
        isNetworkError = true;
        this.#circuitBreaker.recordFailure(url);
        throw error;
      }

      // POST-RESPONSE: Record result
      if (!isNetworkError && ctx.response) {
        if (this.#isFailure(ctx.response)) {
          this.#circuitBreaker.recordFailure(url);
        } else {
          this.#circuitBreaker.recordSuccess(url);
        }
      }
    };
  }
}

/**
 * Creates a circuit breaker middleware with the given options.
 *
 * @param options - Circuit breaker configuration
 * @returns The middleware function
 *
 * @example
 * ```typescript
 * provider.useMiddleware(createCircuitBreakerMiddleware({
 *   failureThreshold: 5,
 *   openDurationMs: 30000,
 * }));
 * ```
 */
export function createCircuitBreakerMiddleware(
  options?: CircuitBreakerMiddlewareOptions,
): FetchClientMiddleware {
  const middleware = new CircuitBreakerMiddleware(options);
  return middleware.middleware();
}

/**
 * Creates a per-domain circuit breaker middleware.
 * Each domain gets its own circuit breaker.
 *
 * @param options - Circuit breaker configuration
 * @returns The middleware function
 *
 * @example
 * ```typescript
 * provider.useMiddleware(createPerDomainCircuitBreakerMiddleware({
 *   failureThreshold: 5,
 *   openDurationMs: 30000,
 * }));
 * ```
 */
export function createPerDomainCircuitBreakerMiddleware(
  options?: Omit<CircuitBreakerMiddlewareOptions, "getGroupFunc">,
): FetchClientMiddleware {
  return createCircuitBreakerMiddleware({
    ...options,
    getGroupFunc: groupByDomain,
  });
}
