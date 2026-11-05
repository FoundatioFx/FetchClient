import type { Counter } from "./Counter.ts";
import type { FetchClientCache } from "./FetchClientCache.ts";
import type { FetchClientMiddleware } from "./FetchClientMiddleware.ts";
import type { FetchClientProvider } from "./FetchClientProvider.ts";
import type { ProblemDetails } from "./ProblemDetails.ts";
import type { RequestOptions } from "./RequestOptions.ts";

/**
 * Fetch client options to use for making HTTP requests.
 */
export type FetchClientOptions = {
  /**
   * The fetch client provider to get shared options from. Any options specified in this options class will override the provider options.
   */
  provider?: FetchClientProvider;

  /**
   * The default request options to use for requests. If specified, these options will be merged with the
   * options from the FetchClientProvider and the options provided in each request.
   */
  defaultRequestOptions?: RequestOptions;

  /**
   * The cache to use for storing HTTP responses.
   */
  cache?: FetchClientCache;

  /**
   * The fetch implementation to use for making HTTP requests.
   * If not provided, the global fetch function will be used.
   */
  fetch?: typeof globalThis.fetch;

  /**
   * An array of middleware functions to be applied to the request.
   */
  middleware?: FetchClientMiddleware[];

  /**
   * The base URL for making HTTP requests.
   */
  baseUrl?: string;

  /**
   * A function that validates the model before making the request.
   * Returns a Promise that resolves to a ProblemDetails object if validation fails, or null if validation succeeds.
   */
  modelValidator?: (model: object | null) => Promise<ProblemDetails | null>;

  /**
   * A function that returns the access token to use for making requests.
   */
  accessTokenFunc?: () => string | null;

  /**
   * Counter for tracking the number of inflight requests at the provider level
   */
  providerCounter?: Counter;
} & Record<string, unknown>;
