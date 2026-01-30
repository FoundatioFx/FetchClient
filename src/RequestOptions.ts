import type { CacheKey, CacheTag } from "./FetchClientCache.ts";
import type { FetchClientResponse } from "./FetchClientResponse.ts";

/**
 * Represents the options for making a request using the FetchClient.
 */
export type RequestOptions = {
  /**
   * Specifies whether the model should be validated before making the request.
   */
  shouldValidateModel?: boolean;

  /**
   * Additional parameters to be included in the request.
   */
  params?: Record<string, unknown>;

  /**
   * By default, the client will throw an error on non-successful and unexpected status codes (outside of 200-299). Use this option to disable that behavior off.
   */
  shouldThrowOnUnexpectedStatusCodes?: boolean;

  /**
   * By default, non-successful status codes (outside of 200-299) will throw an error. Any status code that you wish to
   * handle manually instead of an error being thrown should be included here.
   */
  expectedStatusCodes?: number[];

  /**
   * Additional headers to be included in the request.
   */
  headers?: Record<string, string>;

  /**
   * A callback function to handle non-expected errors that occur during the request. By default, non-successful status
   * codes (outside of 200-299) are considered errors and will throw. If the callback returns true, the error will
   * be treated as handled and ignored. If the callback returns false or doesn't return a value, the error will be thrown.
   */
  errorCallback?: (error: FetchClientResponse<unknown>) => boolean | void;

  /**
   * Timeout duration for the request in milliseconds. If the request takes longer than this duration, it will be aborted and will throw an error.
   */
  timeout?: number;

  /**
   * An AbortSignal object that can be used to cancel the request.
   */
  signal?: AbortSignal;

  /**
   * Specifies whether the JSON parsing should convert strings that look like dates into Date instances.
   */
  shouldParseDates?: boolean;

  /**
   * Specifies a reviver function to use for JSON response parsing.
   */
  reviver?: (this: unknown, key: string, value: unknown) => unknown;
} & Record<string, unknown>;

/**
 * Represents the options for a GET request.
 */
export type GetRequestOptions = RequestOptions & {
  /**
   * The cache key for the request.
   */
  cacheKey?: CacheKey;

  /**
   * The duration for which the response should be cached, in milliseconds.
   */
  cacheDuration?: number;

  /**
   * Tags for grouping and invalidating cache entries. Multiple entries can share
   * the same tag, allowing bulk invalidation via `cache.deleteByTag(tag)`.
   */
  cacheTags?: CacheTag[];
};
