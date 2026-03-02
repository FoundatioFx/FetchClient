export { FetchClient } from "./src/FetchClient.ts";
export type { FetchClientOptions } from "./src/FetchClientOptions.ts";
export type { FetchClientResponse } from "./src/FetchClientResponse.ts";
export { FetchClientError } from "./src/FetchClientError.ts";
export { getStatusText } from "./src/HttpStatusText.ts";
export { ResponsePromise } from "./src/ResponsePromise.ts";
export { ProblemDetails } from "./src/ProblemDetails.ts";
export {
  type CacheKey,
  type CacheTag,
  FetchClientCache,
} from "./src/FetchClientCache.ts";
export type { RequestOptions } from "./src/RequestOptions.ts";
export type { FetchClientMiddleware } from "./src/FetchClientMiddleware.ts";
export type { FetchClientContext } from "./src/FetchClientContext.ts";
export {
  defaultInstance as defaultProviderInstance,
  FetchClientProvider,
} from "./src/FetchClientProvider.ts";
export * from "./src/DefaultHelpers.ts";
export {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitState,
  groupByDomain as circuitBreakerGroupByDomain,
  type GroupCircuitBreakerOptions,
} from "./src/CircuitBreaker.ts";
export {
  CircuitBreakerMiddleware,
  type CircuitBreakerMiddlewareOptions,
  CircuitOpenError,
  createCircuitBreakerMiddleware,
  createPerDomainCircuitBreakerMiddleware,
} from "./src/CircuitBreakerMiddleware.ts";
export {
  createRetryMiddleware,
  RetryMiddleware,
  type RetryMiddlewareOptions,
} from "./src/RetryMiddleware.ts";
export {
  createPerDomainRateLimitMiddleware,
  createRateLimitMiddleware,
  RateLimitError,
  RateLimitMiddleware,
  type RateLimitMiddlewareOptions,
} from "./src/RateLimitMiddleware.ts";
export {
  groupByDomain as rateLimiterGroupByDomain,
  RateLimiter,
  type RateLimiterOptions,
} from "./src/RateLimiter.ts";

import { createRetryMiddleware } from "./src/RetryMiddleware.ts";
import {
  createPerDomainRateLimitMiddleware,
  createRateLimitMiddleware,
} from "./src/RateLimitMiddleware.ts";
import {
  createCircuitBreakerMiddleware,
  createPerDomainCircuitBreakerMiddleware,
} from "./src/CircuitBreakerMiddleware.ts";
import {
  deleteJSON,
  getJSON,
  patchJSON,
  postJSON,
  putJSON,
  useFetchClient,
  useMiddleware,
} from "./src/DefaultHelpers.ts";
import type {
  GetRequestOptions,
  RequestOptions,
} from "./src/RequestOptions.ts";
import type { ResponsePromise } from "./src/ResponsePromise.ts";

/**
 * Convenience middleware factory functions for use with FetchClient.use()
 *
 * @example
 * ```typescript
 * import { FetchClient, middleware } from "@foundatiofx/fetchclient";
 *
 * const client = new FetchClient();
 * client.use(
 *   middleware.retry({ limit: 3 }),
 *   middleware.rateLimit({ maxRequests: 100, windowSeconds: 60 }),
 *   middleware.circuitBreaker({ failureThreshold: 5 })
 * );
 * ```
 */
export const middleware = {
  /** Retry failed requests with exponential backoff and jitter */
  retry: createRetryMiddleware,
  /** Rate limit requests to prevent overwhelming servers */
  rateLimit: createRateLimitMiddleware,
  /** Per-domain rate limit (each domain tracked separately) */
  perDomainRateLimit: createPerDomainRateLimitMiddleware,
  /** Circuit breaker for fault tolerance */
  circuitBreaker: createCircuitBreakerMiddleware,
  /** Per-domain circuit breaker (each domain tracked separately) */
  perDomainCircuitBreaker: createPerDomainCircuitBreakerMiddleware,
};

/**
 * Default export for convenient access to all HTTP methods.
 *
 * @example
 * ```typescript
 * import fc from "@foundatiofx/fetchclient";
 *
 * // Configure middleware
 * fc.use(fc.middleware.retry({ limit: 3 }));
 *
 * // Use JSON methods (recommended)
 * const { data: user } = await fc.getJSON<User>("/api/user/1");
 * const { data: created } = await fc.postJSON<User>("/api/users", { name: "Alice" });
 *
 * // Or use fluent API for other response types
 * const html = await fc.get("/page").text();
 * ```
 */
const fetchClient = {
  /** Sends a GET request. Use `.json<T>()` for typed JSON response. */
  get: (url: string, options?: GetRequestOptions): ResponsePromise<unknown> =>
    useFetchClient().get(url, options),

  /** Sends a POST request. Use `.json<T>()` for typed JSON response. */
  post: (
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): ResponsePromise<unknown> => useFetchClient().post(url, body, options),

  /** Sends a PUT request. Use `.json<T>()` for typed JSON response. */
  put: (
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): ResponsePromise<unknown> => useFetchClient().put(url, body, options),

  /** Sends a PATCH request. Use `.json<T>()` for typed JSON response. */
  patch: (
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): ResponsePromise<unknown> => useFetchClient().patch(url, body, options),

  /** Sends a DELETE request. Use `.json<T>()` for typed JSON response. */
  delete: (url: string, options?: RequestOptions): ResponsePromise<unknown> =>
    useFetchClient().delete(url, options),

  /** Sends a HEAD request. */
  head: (url: string, options?: GetRequestOptions): ResponsePromise<void> =>
    useFetchClient().head(url, options),

  /** Sends a GET request and returns parsed JSON in response.data */
  getJSON,

  /** Sends a POST request and returns parsed JSON in response.data */
  postJSON,

  /** Sends a PUT request and returns parsed JSON in response.data */
  putJSON,

  /** Sends a PATCH request and returns parsed JSON in response.data */
  patchJSON,

  /** Sends a DELETE request and returns parsed JSON in response.data */
  deleteJSON,

  /** Adds middleware to the default provider */
  use: useMiddleware,

  /** Middleware factory functions */
  middleware,
};

export default fetchClient;
