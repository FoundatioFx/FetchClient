import type { FetchClient } from "./FetchClient.ts";
import type { FetchClientMiddleware } from "./FetchClientMiddleware.ts";
import type { FetchClientOptions } from "./FetchClientOptions.ts";
import {
  defaultInstance as defaultProvider,
  type FetchClientProvider,
} from "./FetchClientProvider.ts";
import type { FetchClientResponse } from "./FetchClientResponse.ts";
import type { ProblemDetails } from "./ProblemDetails.ts";
import type { GetRequestOptions, RequestOptions } from "./RequestOptions.ts";
import type { RateLimitConfig } from "./RateLimiter.ts";

let getCurrentProviderFunc: () => FetchClientProvider | null = () => null;

/**
 * Gets a FetchClient instance from the current provider.
 * @returns The FetchClient instance.
 */
export function useFetchClient(options?: FetchClientOptions): FetchClient {
  return getCurrentProvider().getFetchClient(options);
}

/**
 * Sends a GET request to the specified URL using the default client and provider and returns the response as JSON.
 * @param url - The URL to send the GET request to.
 * @param options - Optional request options.
 * @returns A promise that resolves to the response as JSON.
 */
export function getJSON<T>(
  url: string,
  options?: GetRequestOptions,
): Promise<FetchClientResponse<T>> {
  return useFetchClient().getJSON(url, options);
}

/**
 * Sends a POST request with JSON payload using the default client and provider to the specified URL.
 *
 * @template T - The type of the response data.
 * @param {string} url - The URL to send the request to.
 * @param {object | string | FormData} [body] - The JSON payload or form data to send with the request.
 * @param {RequestOptions} [options] - Additional options for the request.
 * @returns {Promise<FetchClientResponse<T>>} - A promise that resolves to the response data.
 */
export function postJSON<T>(
  url: string,
  body?: object | string | FormData,
  options?: RequestOptions,
): Promise<FetchClientResponse<T>> {
  return useFetchClient().postJSON(url, body, options);
}

/**
 * Sends a PUT request with JSON payload using the default client and provider to the specified URL.
 *
 * @template T - The type of the response data.
 * @param {string} url - The URL to send the request to.
 * @param {object | string} [body] - The JSON payload to send with the request.
 * @param {RequestOptions} [options] - Additional options for the request.
 * @returns {Promise<FetchClientResponse<T>>} - A promise that resolves to the response data.
 */
export function putJSON<T>(
  url: string,
  body?: object | string,
  options?: RequestOptions,
): Promise<FetchClientResponse<T>> {
  return useFetchClient().putJSON(url, body, options);
}

/**
 * Sends a PATCH request with JSON payload using the default client and provider to the specified URL.
 *
 * @template T - The type of the response data.
 * @param {string} url - The URL to send the request to.
 * @param {object | string} [body] - The JSON payload to send with the request.
 * @param {RequestOptions} [options] - Additional options for the request.
 * @returns {Promise<FetchClientResponse<T>>} - A promise that resolves to the response data.
 */
export function patchJSON<T>(
  url: string,
  body?: object | string,
  options?: RequestOptions,
): Promise<FetchClientResponse<T>> {
  return useFetchClient().patchJSON(url, body, options);
}

/**
 * Sends a DELETE request with JSON payload using the default client and provider to the specified URL.
 *
 * @template T - The type of the response data.
 * @param {string} url - The URL to send the request to.
 * @param {RequestOptions} [options] - Additional options for the request.
 * @returns {Promise<FetchClientResponse<T>>} - A promise that resolves to the response data.
 */
export function deleteJSON<T>(
  url: string,
  options?: RequestOptions,
): Promise<FetchClientResponse<T>> {
  return useFetchClient().deleteJSON(url, options);
}

/**
 * Gets the current FetchClientProvider.
 * @returns The current FetchClientProvider.
 */
export function getCurrentProvider(): FetchClientProvider {
  if (getCurrentProviderFunc === null) {
    return defaultProvider;
  }

  return getCurrentProviderFunc() ?? defaultProvider;
}

/**
 * Sets the function that retrieves the current FetchClientProvider using whatever scoping mechanism is available.
 * @param getProviderFunc - The function that retrieves the current FetchClientProvider.
 * @returns void
 */
export function setCurrentProviderFunc(
  getProviderFunc: () => FetchClientProvider | null,
) {
  getCurrentProviderFunc = getProviderFunc;
}

/**
 * Sets the base URL for any FetchClient instances created by the current provider.
 * @param baseUrl - The base URL to use for requests.
 */
export function setBaseUrl(baseUrl: string) {
  getCurrentProvider().setBaseUrl(baseUrl);
}

/**
 * Sets the access token function for any FetchClient instances created by the current provider.
 * @param accessTokenFunc - The function that retrieves the access token.
 */
export function setAccessTokenFunc(
  accessTokenFunc: () => string | null,
) {
  getCurrentProvider().setAccessTokenFunc(accessTokenFunc);
}

/**
 * Sets the model validator function for any FetchClient instances created by the current provider.
 * @param validate - The function that validates the model.
 */
export function setModelValidator(
  validate: (model: object | null) => Promise<ProblemDetails | null>,
) {
  getCurrentProvider().setModelValidator(validate);
}

/**
 * Adds a middleware to any FetchClient instances created by the current provider.
 * @param middleware - The middleware function to be added.
 */
export function useMiddleware(middleware: FetchClientMiddleware) {
  getCurrentProvider().useMiddleware(middleware);
}

/**
 * Sets the default request options for any FetchClient instances created by the current provider.
 * @param options - The options to set as the default request options.
 */
export function setRequestOptions(options: RequestOptions) {
  getCurrentProvider().applyOptions({ defaultRequestOptions: options });
}

/**
 * Enables rate limiting for the current provider.
 * @param config - The rate limit configuration.
 */
export function enableRateLimit(config: RateLimitConfig) {
  getCurrentProvider().enableRateLimit(config);
}
