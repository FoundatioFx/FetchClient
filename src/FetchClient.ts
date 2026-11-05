import { Counter, trackLoading } from "./Counter.ts";
import {
  type GetRequestOptions,
  mergeRequestOptions,
  type QueryRequestOptions,
  type RequestOptions,
} from "./RequestOptions.ts";
import { ProblemDetails } from "./ProblemDetails.ts";
import type { FetchClientResponse } from "./FetchClientResponse.ts";
import type { FetchClientMiddleware } from "./FetchClientMiddleware.ts";
import type { FetchClientContext } from "./FetchClientContext.ts";
import { parseLinkHeader } from "./LinkHeader.ts";
import type { FetchClientCache } from "./FetchClientCache.ts";
import { FetchClientProvider } from "./FetchClientProvider.ts";
import { getCurrentProvider } from "./DefaultHelpers.ts";
import type { FetchClientOptions } from "./FetchClientOptions.ts";
import { type IObjectEvent, ObjectEvent } from "./ObjectEvent.ts";
import { ResponsePromise } from "./ResponsePromise.ts";
import { createProblemResponse } from "./ProblemResponse.ts";
import { reviveJsonValue } from "./JsonReviver.ts";
import { FetchClientDeserializationError, FetchClientError } from "./FetchClientError.ts";
import { getStatusText } from "./HttpStatusText.ts";

type Fetch = typeof globalThis.fetch;
type RequestInitWithObjectBody = Omit<RequestInit, "body" | "headers"> & {
  body?: BodyInit | object | null;
  headers?: Record<string, string>;
};

/**
 * Represents a client for making HTTP requests using the Fetch API.
 */
export class FetchClient {
  #provider: FetchClientProvider;
  #options?: FetchClientOptions;
  #counter = new Counter();
  #middleware: FetchClientMiddleware[] = [];
  #onLoading = new ObjectEvent<boolean>();

  /**
   * Represents a FetchClient that handles HTTP requests using the Fetch API.
   * @param optionsOrProvider - Client options, or the provider to inherit defaults from.
   */
  constructor(optionsOrProvider?: FetchClientOptions | FetchClientProvider) {
    if (optionsOrProvider instanceof FetchClientProvider) {
      this.#provider = optionsOrProvider;
    } else {
      this.#provider = optionsOrProvider?.provider ?? getCurrentProvider();
      if (optionsOrProvider) {
        const providerOptions = this.#provider.options;
        this.#options = {
          ...providerOptions,
          ...optionsOrProvider,
          defaultRequestOptions: mergeRequestOptions(
            providerOptions.defaultRequestOptions,
            optionsOrProvider.defaultRequestOptions,
          ),
        };
      }
    }

    trackLoading(this.#counter, this.#onLoading);
  }

  /**
   * Gets the provider used by this FetchClient instance. The provider contains shared options that can be used by multiple FetchClient instances.
   */
  public get provider(): FetchClientProvider {
    return this.#provider;
  }

  /**
   * Gets the options used by this FetchClient instance.
   */
  public get options(): FetchClientOptions {
    return this.#options ?? this.#provider.options;
  }

  /**
   * Gets the cache used for storing HTTP responses.
   */
  public get cache(): FetchClientCache {
    return this.#options?.cache ?? this.#provider.cache;
  }

  /**
   * Gets the fetch implementation used for making HTTP requests.
   */
  public get fetch(): Fetch | undefined {
    return this.#options?.fetch ?? this.#provider.fetch;
  }

  /**
   * Gets the number of inflight requests for this FetchClient instance.
   */
  public get requestCount(): number {
    return this.#counter.count;
  }

  /**
   * Gets a value indicating whether the client is currently loading.
   * @returns A boolean value indicating whether the client is loading.
   */
  public get isLoading(): boolean {
    return this.requestCount > 0;
  }

  /**
   * Gets an event that is triggered when the loading state changes.
   */
  public get loading(): IObjectEvent<boolean> {
    return this.#onLoading.expose();
  }

  /**
   * Adds one or more middleware functions to the FetchClient's middleware pipeline.
   * Middleware functions are executed in the order they are added.
   *
   * @param mw - The middleware functions to add.
   */
  public use(...mw: FetchClientMiddleware[]): FetchClient {
    this.#middleware.push(...mw);
    return this;
  }

  /**
   * Sends a GET request to the specified URL.
   *
   * @param url - The URL to send the GET request to.
   * @param options - The optional request options.
   * @returns A ResponsePromise that resolves to the response. Can use `.json<T>()` for typed JSON.
   */
  get(url: string, options?: GetRequestOptions): ResponsePromise<unknown> {
    const mergedOptions = this.mergeWithDefaultRequestOptions(options);

    const responsePromise = this.fetchInternal(
      url,
      mergedOptions,
      this.buildRequestInit("GET", undefined, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  /**
   * Sends a GET request to the specified URL and returns the response as JSON.
   * The response will have the parsed JSON in `response.data`.
   *
   * @param url - The URL to send the GET request to.
   * @param options - Optional request options.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async getJSON<T>(url: string, options?: GetRequestOptions): Promise<FetchClientResponse<T>> {
    const mergedOptions = this.buildJsonRequestOptions(options);
    return (await this.get(url, mergedOptions)) as FetchClientResponse<T>;
  }

  /**
   * Sends a safe, idempotent QUERY request to the specified URL.
   *
   * @param url - The URL to send the request to.
   * @param body - The query content, which can be an object, a string, or FormData.
   * @param options - Additional options for the request.
   * @returns A ResponsePromise that resolves to the response. Can use `.json<T>()` for typed JSON.
   */
  query(
    url: string,
    body?: object | string | FormData,
    options?: QueryRequestOptions,
  ): ResponsePromise<unknown> {
    const mergedOptions = this.mergeWithDefaultRequestOptions(options);

    const responsePromise = this.fetchInternal(
      url,
      mergedOptions,
      this.buildRequestInit("QUERY", body, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  /**
   * Sends a QUERY request with JSON content to the specified URL.
   * The response will have the parsed JSON in `response.data`.
   *
   * @template T - The type of the response data.
   * @param url - The URL to send the request to.
   * @param body - The query content to send with the request.
   * @param options - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async queryJSON<T>(
    url: string,
    body?: object | string | FormData,
    options?: QueryRequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return (await this.query(
      url,
      body,
      this.buildJsonRequestOptions(options),
    )) as FetchClientResponse<T>;
  }

  /**
   * Sends a POST request to the specified URL.
   *
   * @param url - The URL to send the request to.
   * @param body - The request body, can be an object, a string, or FormData.
   * @param options - Additional options for the request.
   * @returns A ResponsePromise that resolves to the response. Can use `.json<T>()` for typed JSON.
   */
  post(
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): ResponsePromise<unknown> {
    const mergedOptions = this.mergeWithDefaultRequestOptions(options);

    const responsePromise = this.fetchInternal(
      url,
      mergedOptions,
      this.buildRequestInit("POST", body, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  /**
   * Sends a POST request with JSON payload to the specified URL.
   * The response will have the parsed JSON in `response.data`.
   *
   * @template T - The type of the response data.
   * @param url - The URL to send the request to.
   * @param body - The JSON payload or form data to send with the request.
   * @param options - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async postJSON<T>(
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return (await this.post(
      url,
      body,
      this.buildJsonRequestOptions(options),
    )) as FetchClientResponse<T>;
  }

  /**
   * Sends a PUT request to the specified URL with the given body and options.
   * @param url - The URL to send the request to.
   * @param body - The request body, can be an object, a string, or FormData.
   * @param options - The request options.
   * @returns A ResponsePromise that resolves to the response. Can use `.json<T>()` for typed JSON.
   */
  put(
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): ResponsePromise<unknown> {
    const mergedOptions = this.mergeWithDefaultRequestOptions(options);

    const responsePromise = this.fetchInternal(
      url,
      mergedOptions,
      this.buildRequestInit("PUT", body, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  /**
   * Sends a PUT request with JSON payload to the specified URL.
   * The response will have the parsed JSON in `response.data`.
   *
   * @template T - The type of the response data.
   * @param url - The URL to send the request to.
   * @param body - The JSON payload to send with the request.
   * @param options - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async putJSON<T>(
    url: string,
    body?: object | string,
    options?: RequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return (await this.put(
      url,
      body,
      this.buildJsonRequestOptions(options),
    )) as FetchClientResponse<T>;
  }

  /**
   * Sends a PATCH request to the specified URL with the provided body and options.
   * @param url - The URL to send the PATCH request to.
   * @param body - The body of the request. It can be an object, a string, or FormData.
   * @param options - The options for the request.
   * @returns A ResponsePromise that resolves to the response. Can use `.json<T>()` for typed JSON.
   */
  patch(
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): ResponsePromise<unknown> {
    const mergedOptions = this.mergeWithDefaultRequestOptions(options);

    const responsePromise = this.fetchInternal(
      url,
      mergedOptions,
      this.buildRequestInit("PATCH", body, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  /**
   * Sends a PATCH request with JSON payload to the specified URL.
   * The response will have the parsed JSON in `response.data`.
   *
   * @template T - The type of the response data.
   * @param url - The URL to send the request to.
   * @param body - The JSON payload to send with the request.
   * @param options - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async patchJSON<T>(
    url: string,
    body?: object | string,
    options?: RequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return (await this.patch(
      url,
      body,
      this.buildJsonRequestOptions(options),
    )) as FetchClientResponse<T>;
  }

  /**
   * Sends a DELETE request to the specified URL.
   *
   * @param url - The URL to send the DELETE request to.
   * @param options - The options for the request.
   * @returns A ResponsePromise that resolves to the response. Can use `.json<T>()` for typed JSON.
   */
  delete(url: string, options?: RequestOptions): ResponsePromise<unknown> {
    const mergedOptions = this.mergeWithDefaultRequestOptions(options);

    const responsePromise = this.fetchInternal(
      url,
      mergedOptions,
      this.buildRequestInit("DELETE", undefined, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  /**
   * Sends a DELETE request with JSON payload to the specified URL.
   * The response will have the parsed JSON in `response.data`.
   *
   * @template T - The type of the response data.
   * @param url - The URL to send the request to.
   * @param options - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async deleteJSON<T>(url: string, options?: RequestOptions): Promise<FetchClientResponse<T>> {
    return (await this.delete(
      url,
      this.buildJsonRequestOptions(options),
    )) as FetchClientResponse<T>;
  }

  /**
   * Sends a HEAD request to the specified URL.
   * HEAD requests are identical to GET requests but without the response body.
   *
   * @param url - The URL to send the HEAD request to.
   * @param options - The optional request options.
   * @returns A ResponsePromise that resolves to the response.
   */
  head(url: string, options?: GetRequestOptions): ResponsePromise<void> {
    const mergedOptions = this.mergeWithDefaultRequestOptions(options);

    const responsePromise = this.fetchInternal<void>(
      url,
      mergedOptions,
      this.buildRequestInit("HEAD", undefined, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  private async validate(data: unknown, options?: RequestOptions): Promise<ProblemDetails | null> {
    if (typeof data !== "object" || options?.shouldValidateModel === false) return null;

    const problem = await this.options.modelValidator?.(data as object);
    return problem ?? null;
  }

  private async fetchInternal<T>(
    url: string,
    options: RequestOptions,
    init?: RequestInitWithObjectBody,
  ): Promise<FetchClientResponse<T>> {
    const { builtUrl, absoluteUrl } = this.buildUrl(url, options);

    if (this.isJsonLikeObject(init?.body)) {
      const problem = await this.validate(init.body, options);
      if (problem) {
        return createProblemResponse<T>(problem, url);
      }

      init.body = JSON.stringify(init.body);
    }

    const accessToken = this.options.accessTokenFunc?.() ?? null;
    if (accessToken !== null) {
      init = {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
      };
    }

    if (options.signal) {
      init = { ...init, signal: options.signal };
    }

    if (options.timeout) {
      let signal = AbortSignal.timeout(options.timeout);

      if (init?.signal) {
        signal = this.mergeAbortSignals(signal, init.signal);
      }

      init = { ...init, signal };
    }

    const fetchMiddleware = async (ctx: FetchClientContext, next: () => Promise<void>) => {
      const getOptions = ctx.options as GetRequestOptions;
      if (getOptions?.cacheKey) {
        const cachedResponse = this.cache.get(getOptions.cacheKey);
        if (cachedResponse) {
          ctx.response = cachedResponse as FetchClientResponse<T>;
          return;
        }
      }

      try {
        const response = await (this.fetch ? this.fetch(ctx.request) : fetch(ctx.request));

        if (
          ctx.request.headers.get("Accept")?.startsWith("application/json") ||
          response?.headers.get("Content-Type")?.startsWith("application/problem+json")
        ) {
          ctx.response = await this.getJSONResponse<T>(response, ctx.options, ctx.request.signal);
        } else {
          ctx.response = response as FetchClientResponse<T>;
          ctx.response.data = null;
          ctx.response.problem = new ProblemDetails();
        }

        ctx.response.meta = {
          links: parseLinkHeader(response.headers.get("Link")) || {},
        };

        if (getOptions?.cacheKey) {
          this.cache.set(
            getOptions.cacheKey,
            ctx.response,
            getOptions.cacheDuration,
            getOptions.cacheTags,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          ctx.response = createProblemResponse<T>(
            Object.assign(new ProblemDetails(), { status: 408, title: "Request Timeout" }),
            ctx.request.url,
          );
        } else {
          throw error;
        }
      }

      await next();
    };

    const middleware = [...(this.options.middleware ?? []), ...this.#middleware, fetchMiddleware];

    this.#counter.increment();
    this.#provider.counter.increment();

    let request: Request;
    try {
      request = new Request(builtUrl, init as RequestInit);
    } catch {
      // try using absolute URL
      request = new Request(absoluteUrl, init as RequestInit);
    }

    const context: FetchClientContext = {
      options,
      request,
      response: null,
      meta: {},
    };

    try {
      await this.invokeMiddleware(context, middleware);
      this.validateResponse(context.response, options);
      return context.response as FetchClientResponse<T>;
    } catch (error) {
      if (
        error instanceof FetchClientDeserializationError &&
        options.errorCallback?.(error.response) === true
      ) {
        return error.response as FetchClientResponse<T>;
      }

      throw error;
    } finally {
      this.#counter.decrement();
      this.#provider.counter.decrement();
    }
  }

  private async invokeMiddleware(
    context: FetchClientContext,
    middleware: FetchClientMiddleware[],
  ): Promise<void> {
    if (!middleware.length) return;

    const mw = middleware[0];

    return await mw(context, async () => {
      await this.invokeMiddleware(context, middleware.slice(1));
    });
  }

  private mergeAbortSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    const onAbort = (event: Event) => {
      const originalSignal = event.target as AbortSignal;
      try {
        controller.abort(originalSignal.reason);
      } catch {
        // Just in case multiple signals abort nearly simultaneously
      }
    };

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener("abort", onAbort);
    }

    return controller.signal;
  }

  private async getJSONResponse<T>(
    response: Response,
    options: RequestOptions,
    signal: AbortSignal,
  ): Promise<FetchClientResponse<T>> {
    let data: unknown = null;
    let bodyText = "";
    try {
      bodyText = await response.text();
      if (bodyText) {
        if (options.reviver || options.shouldParseDates) {
          data = JSON.parse(bodyText, (key, value) => reviveJsonValue(this, options, key, value));
        } else {
          data = JSON.parse(bodyText);
        }
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw signal.reason;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      const problem = new ProblemDetails();
      problem.detail = bodyText;
      problem.title = `Unable to deserialize response data: ${
        error instanceof Error ? error.message : String(error)
      }`;
      problem.setErrorMessage(problem.title);

      if (response.ok) {
        const jsonResponse = response as FetchClientResponse<T>;
        jsonResponse.data = null;
        jsonResponse.problem = problem;
        jsonResponse.meta = {
          links: parseLinkHeader(response.headers.get("Link")) || {},
        };

        throw new FetchClientDeserializationError(jsonResponse, error, bodyText);
      }

      data = problem;
    }

    const jsonResponse = response as FetchClientResponse<T>;

    if (
      !response.ok ||
      response.headers.get("Content-Type")?.startsWith("application/problem+json")
    ) {
      jsonResponse.problem = Object.assign(new ProblemDetails(), data);
      jsonResponse.data = null;
      return jsonResponse;
    }

    jsonResponse.problem = new ProblemDetails();
    jsonResponse.data = data as T;

    return jsonResponse;
  }

  private buildRequestInit(
    method: "GET" | "HEAD" | "QUERY" | "POST" | "PUT" | "PATCH" | "DELETE",
    body: object | string | FormData | undefined,
    options: RequestOptions | undefined,
  ): RequestInitWithObjectBody {
    const headers: Record<string, string> = {};
    if (this.isJsonLikeObject(body)) {
      headers["Content-Type"] = "application/json";
    }

    return {
      method,
      headers: {
        ...headers,
        ...options?.headers,
      },
      body,
    };
  }

  private isJsonLikeObject(body: unknown): body is object {
    if (body === null || typeof body !== "object") {
      return false;
    }

    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return false;
    }

    if (typeof Blob !== "undefined" && body instanceof Blob) {
      return false;
    }

    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return false;
    }

    if (
      typeof ArrayBuffer !== "undefined" &&
      (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
    ) {
      return false;
    }

    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      return false;
    }

    return true;
  }

  private buildJsonRequestOptions(options: RequestOptions | undefined): RequestOptions {
    return {
      ...options,
      headers: {
        Accept: "application/json, application/problem+json",
        ...options?.headers,
      },
    };
  }

  private mergeWithDefaultRequestOptions<T extends RequestOptions>(options?: T): T {
    return mergeRequestOptions(this.options.defaultRequestOptions, options);
  }

  private buildUrl(
    url: string,
    options: RequestOptions | undefined,
  ): { builtUrl: string; absoluteUrl: string } {
    let builtUrl = url;

    if (!builtUrl.startsWith("http") && this.options.baseUrl) {
      if (this.options.baseUrl.endsWith("/") || builtUrl.startsWith("/")) {
        builtUrl = this.options.baseUrl + builtUrl;
      } else {
        builtUrl = this.options.baseUrl + "/" + builtUrl;
      }
    }

    const isAbsoluteUrl = builtUrl.startsWith("http");

    const origin = globalThis.location?.origin;
    const parsed = isAbsoluteUrl
      ? new URL(builtUrl)
      : new URL(builtUrl, origin?.startsWith("http") ? origin : "http://localhost");

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null && !parsed.searchParams.has(key)) {
          parsed.searchParams.set(key, value as string);
        }
      }
    }

    builtUrl = parsed.toString();

    const result = isAbsoluteUrl ? builtUrl : `${parsed.pathname}${parsed.search}`;

    return { builtUrl: result, absoluteUrl: builtUrl };
  }

  private validateResponse(
    response: FetchClientResponse<unknown> | null,
    options: RequestOptions | undefined,
  ) {
    if (!response) {
      throw new Error("Response is null");
    }

    if (response.ok || options?.shouldThrowOnUnexpectedStatusCodes === false) {
      return;
    }

    if (options?.expectedStatusCodes?.includes(response.status)) {
      return;
    }

    if (options?.errorCallback) {
      const result = options.errorCallback(response);
      if (result === true) {
        return;
      }
    }

    response.problem ??= new ProblemDetails();
    response.problem.status = response.status;
    if (!response.problem.title) {
      response.problem.title = getStatusText(response.status);
    }
    response.problem.setErrorMessage(response.problem.title);

    throw new FetchClientError(response);
  }
}
