import type { FetchClientContext } from "./FetchClientContext.ts";
import type { FetchClientMiddleware } from "./FetchClientMiddleware.ts";
import type { FetchClientResponse } from "./FetchClientResponse.ts";
import { ProblemDetails } from "./ProblemDetails.ts";
import {
  buildRateLimitHeader,
  buildRateLimitPolicyHeader,
  groupByDomain,
  RateLimiter,
  type RateLimiterOptions,
} from "./RateLimiter.ts";

/**
 * Rate limiting error thrown when requests exceed the rate limit.
 */
export class RateLimitError extends Error {
  public readonly resetTime: number;
  public readonly remainingRequests: number;

  constructor(resetTime: number, remainingRequests: number, message?: string) {
    super(
      message ||
        `Rate limit exceeded. Try again after ${
          new Date(resetTime).toISOString()
        }`,
    );
    this.name = "RateLimitError";
    this.resetTime = resetTime;
    this.remainingRequests = remainingRequests;
  }
}

/**
 * Configuration options for the rate limiting middleware.
 */
export interface RateLimitMiddlewareOptions extends RateLimiterOptions {
  /**
   * Whether to throw an error when rate limit is exceeded.
   * If false, the middleware will set a 429 status response.
   * @default true
   */
  throwOnRateLimit?: boolean;

  /**
   * Custom error message when rate limit is exceeded.
   */
  errorMessage?: string;

  /**
   * Whether to automatically update rate limits based on response headers.
   * @default true
   */
  autoUpdateFromHeaders?: boolean;
}

/**
 * Rate limiting middleware instance that can be shared across requests.
 */
export class RateLimitMiddleware {
  #rateLimiter: RateLimiter;

  private readonly throwOnRateLimit: boolean;
  private readonly errorMessage?: string;
  private readonly autoUpdateFromHeaders: boolean;

  constructor(options: RateLimitMiddlewareOptions) {
    this.#rateLimiter = new RateLimiter(options);
    this.throwOnRateLimit = options.throwOnRateLimit ?? true;
    this.errorMessage = options.errorMessage;
    this.autoUpdateFromHeaders = options.autoUpdateFromHeaders ?? true;
  }

  /**
   * Gets the underlying rate limiter instance.
   */
  public get rateLimiter(): RateLimiter {
    return this.#rateLimiter;
  }

  /**
   * Creates the middleware function.
   * @returns The middleware function
   */
  public middleware(): FetchClientMiddleware {
    return async (context: FetchClientContext, next: () => Promise<void>) => {
      const url = context.request.url;

      // Check if request is allowed
      if (!this.rateLimiter.isAllowed(url)) {
        const group = this.rateLimiter.getGroup(url);
        const resetTime = this.rateLimiter.getResetTime(url) ?? Date.now();
        const remainingRequests = this.rateLimiter.getRemainingRequests(url);

        if (this.throwOnRateLimit) {
          throw new RateLimitError(
            resetTime,
            remainingRequests,
            this.errorMessage,
          );
        }

        // Create a 429 Too Many Requests response
        const groupOptions = this.rateLimiter.getGroupOptions(group);
        const maxRequests = groupOptions.maxRequests!;
        const windowSeconds = groupOptions.windowSeconds!;

        // Create IETF standard rate limit headers
        const resetSeconds = Math.ceil((resetTime - Date.now()) / 1000);
        const rateLimitHeader = buildRateLimitHeader({
          policy: group,
          remaining: remainingRequests,
          resetSeconds: resetSeconds,
        });

        const rateLimitPolicyHeader = buildRateLimitPolicyHeader({
          policy: group,
          limit: maxRequests,
          windowSeconds: Math.floor(windowSeconds),
        });

        const headers = new Headers({
          "Content-Type": "application/problem+json",
          "RateLimit": rateLimitHeader,
          "RateLimit-Policy": rateLimitPolicyHeader,
          // Legacy headers for backward compatibility
          "RateLimit-Limit": maxRequests.toString(),
          "RateLimit-Remaining": remainingRequests.toString(),
          "RateLimit-Reset": Math.ceil(resetTime / 1000).toString(),
          "Retry-After": resetSeconds.toString(),
        });

        const problem = new ProblemDetails();
        problem.status = 429;
        problem.title = "Too Many Requests";
        problem.detail = this.errorMessage ||
          `Rate limit exceeded. Try again after ${
            new Date(resetTime).toISOString()
          }`;

        context.response = {
          url: context.request.url,
          status: 429,
          statusText: "Too Many Requests",
          body: null,
          bodyUsed: true,
          ok: false,
          headers: headers,
          redirected: false,
          type: "basic",
          problem: problem,
          data: null,
          meta: { links: {} },
          json: () => Promise.resolve(problem),
          text: () => Promise.resolve(JSON.stringify(problem)),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          // @ts-ignore: New in Deno 1.44
          bytes: () => Promise.resolve(new Uint8Array()),
          blob: () => Promise.resolve(new Blob()),
          formData: () => Promise.resolve(new FormData()),
          clone: () => {
            throw new Error("Not implemented");
          },
        } as FetchClientResponse<unknown>;

        return;
      }

      await next();

      if (this.autoUpdateFromHeaders && context.response) {
        this.rateLimiter.updateFromHeadersForRequest(
          url,
          context.response.headers,
        );
      }
    };
  }
}

/**
 * Creates a rate limit middleware with the given options.
 *
 * @example
 * ```typescript
 * const client = new FetchClient();
 * client.use(createRateLimitMiddleware({
 *   maxRequests: 100,
 *   windowSeconds: 60,
 * }));
 * ```
 */
export function createRateLimitMiddleware(
  options: RateLimitMiddlewareOptions,
): FetchClientMiddleware {
  return new RateLimitMiddleware(options).middleware();
}

/**
 * Creates a per-domain rate limit middleware where each domain is tracked separately.
 *
 * @example
 * ```typescript
 * const client = new FetchClient();
 * client.use(createPerDomainRateLimitMiddleware({
 *   maxRequests: 100,
 *   windowSeconds: 60,
 * }));
 * // api.example.com and api.other.com will have separate rate limits
 * ```
 */
export function createPerDomainRateLimitMiddleware(
  options: RateLimitMiddlewareOptions,
): FetchClientMiddleware {
  return new RateLimitMiddleware({
    ...options,
    getGroupFunc: groupByDomain,
  }).middleware();
}
