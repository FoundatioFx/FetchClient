import { Counter } from "./Counter.ts";
import type { GetRequestOptions, RequestOptions } from "./RequestOptions.ts";
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
import { FetchClientError } from "./FetchClientError.ts";

type Fetch = typeof globalThis.fetch;
type RequestInitWithObjectBody = Omit<RequestInit, "body"> & {
  body?: BodyInit | object | null;
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
   * @param options - The options to use for the FetchClient.
   */
  constructor(optionsOrProvider?: FetchClientOptions | FetchClientProvider) {
    if (optionsOrProvider instanceof FetchClientProvider) {
      this.#provider = optionsOrProvider;
    } else {
      this.#provider = optionsOrProvider?.provider ?? getCurrentProvider();
      if (optionsOrProvider) {
        this.#options = {
          ...this.#provider.options,
          ...optionsOrProvider,
        };
      }
    }

    this.#counter.changed.on((e) => {
      if (!e) {
        throw new Error("Event data is required.");
      }

      if (e.value > 0 && e.previous == 0) {
        this.#onLoading.trigger(true);
      } else if (e.value == 0 && e.previous > 0) {
        this.#onLoading.trigger(false);
      }
    });
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
   * @returns {boolean} A boolean value indicating whether the client is loading.
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
  get(
    url: string,
    options?: GetRequestOptions,
  ): ResponsePromise<unknown> {
    const mergedOptions = {
      ...this.options.defaultRequestOptions,
      ...options,
    };

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
  async getJSON<T>(
    url: string,
    options?: GetRequestOptions,
  ): Promise<FetchClientResponse<T>> {
    const mergedOptions = this.buildJsonRequestOptions(options);
    return await this.get(url, mergedOptions) as FetchClientResponse<T>;
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
    const mergedOptions = {
      ...this.options.defaultRequestOptions,
      ...options,
    };

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
   * @param {string} url - The URL to send the request to.
   * @param {object | string | FormData} [body] - The JSON payload or form data to send with the request.
   * @param {RequestOptions} [options] - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async postJSON<T>(
    url: string,
    body?: object | string | FormData,
    options?: RequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return await this.post(
      url,
      body,
      this.buildJsonRequestOptions(options),
    ) as FetchClientResponse<T>;
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
    const mergedOptions = {
      ...this.options.defaultRequestOptions,
      ...options,
    };

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
   * @param {string} url - The URL to send the request to.
   * @param {object | string} [body] - The JSON payload to send with the request.
   * @param {RequestOptions} [options] - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async putJSON<T>(
    url: string,
    body?: object | string,
    options?: RequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return await this.put(
      url,
      body,
      this.buildJsonRequestOptions(options),
    ) as FetchClientResponse<T>;
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
    const mergedOptions = {
      ...this.options.defaultRequestOptions,
      ...options,
    };

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
   * @param {string} url - The URL to send the request to.
   * @param {object | string} [body] - The JSON payload to send with the request.
   * @param {RequestOptions} [options] - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async patchJSON<T>(
    url: string,
    body?: object | string,
    options?: RequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return await this.patch(
      url,
      body,
      this.buildJsonRequestOptions(options),
    ) as FetchClientResponse<T>;
  }

  /**
   * Sends a DELETE request to the specified URL.
   *
   * @param url - The URL to send the DELETE request to.
   * @param options - The options for the request.
   * @returns A ResponsePromise that resolves to the response. Can use `.json<T>()` for typed JSON.
   */
  delete(
    url: string,
    options?: RequestOptions,
  ): ResponsePromise<unknown> {
    const mergedOptions = {
      ...this.options.defaultRequestOptions,
      ...options,
    };

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
   * @param {string} url - The URL to send the request to.
   * @param {RequestOptions} [options] - Additional options for the request.
   * @returns A promise that resolves to the response with parsed JSON in `data`.
   */
  async deleteJSON<T>(
    url: string,
    options?: RequestOptions,
  ): Promise<FetchClientResponse<T>> {
    return await this.delete(
      url,
      this.buildJsonRequestOptions(options),
    ) as FetchClientResponse<T>;
  }

  /**
   * Sends a HEAD request to the specified URL.
   * HEAD requests are identical to GET requests but without the response body.
   *
   * @param url - The URL to send the HEAD request to.
   * @param options - The optional request options.
   * @returns A ResponsePromise that resolves to the response.
   */
  head(
    url: string,
    options?: GetRequestOptions,
  ): ResponsePromise<void> {
    const mergedOptions = {
      ...this.options.defaultRequestOptions,
      ...options,
    };

    const responsePromise = this.fetchInternal<void>(
      url,
      mergedOptions,
      this.buildRequestInit("HEAD", undefined, mergedOptions),
    );

    return new ResponsePromise(responsePromise, mergedOptions);
  }

  private async validate(
    data: unknown,
    options?: RequestOptions,
  ): Promise<ProblemDetails | null> {
    if (
      typeof data !== "object" ||
      (options && options.shouldValidateModel === false)
    ) return null;

    if (this.options?.modelValidator === undefined) {
      return null;
    }

    const problem = await this.options.modelValidator(data as object);
    if (!problem) return null;

    return problem;
  }

  private async fetchInternal<T>(
    url: string,
    options: RequestOptions,
    init?: RequestInitWithObjectBody,
  ): Promise<FetchClientResponse<T>> {
    const { builtUrl, absoluteUrl } = this.buildUrl(url, options);

    // if we have a body and it's not FormData, validate it before proceeding
    if (init?.body && !(init?.body instanceof FormData)) {
      const problem = await this.validate(init?.body, options);
      if (problem) {
        return this.problemToResponse<T>(problem, url);
      }
    }

    if (
      init?.body && typeof init.body === "object" &&
      !(init.body instanceof FormData)
    ) {
      init.body = JSON.stringify(init.body);
    }

    const accessToken = this.options.accessTokenFunc?.() ?? null;
    if (accessToken !== null) {
      init = {
        ...init,
        ...{
          headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
        },
      };
    }

    if (options?.signal) {
      init = { ...init, signal: options.signal };
    }

    if (options?.timeout) {
      let signal = AbortSignal.timeout(options.timeout);

      if (init?.signal) {
        signal = this.mergeAbortSignals(signal, init.signal);
      }

      init = { ...init, signal: signal };
    }

    const fetchMiddleware = async (
      ctx: FetchClientContext,
      next: () => Promise<void>,
    ) => {
      const getOptions = ctx.options as GetRequestOptions;
      if (getOptions?.cacheKey) {
        const cachedResponse = this.cache.get(getOptions.cacheKey);
        if (cachedResponse) {
          ctx.response = cachedResponse as FetchClientResponse<T>;
          return;
        }
      }

      try {
        const response =
          await (this.fetch ? this.fetch(ctx.request) : fetch(ctx.request));

        if (
          ctx.request.headers.get("Accept")?.startsWith("application/json") ||
          response?.headers.get("Content-Type")?.startsWith(
            "application/problem+json",
          )
        ) {
          ctx.response = await this.getJSONResponse<T>(response, ctx.options);
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
          ctx.response = this.problemToResponse(
            Object.assign(new ProblemDetails(), {
              status: 408,
              title: "Request Timeout",
            }),
            ctx.request.url,
          ) as FetchClientResponse<T>;
        } else {
          throw error;
        }
      }

      await next();
    };

    const middleware = [
      ...this.options.middleware ?? [],
      ...this.#middleware,
      fetchMiddleware,
    ];

    this.#counter.increment();
    this.#provider.counter.increment();

    let request: Request | null = null;

    try {
      request = new Request(builtUrl, init as RequestInit);
    } catch {
      // try using absolute URL
      request = new Request(absoluteUrl, init as RequestInit);
    }

    const context: FetchClientContext = {
      options,
      request: request!,
      response: null,
      meta: {},
    };

    await this.invokeMiddleware(context, middleware);

    this.#counter.decrement();
    this.#provider.counter.decrement();

    this.validateResponse(context.response, options);

    return context.response as FetchClientResponse<T>;
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
  ): Promise<FetchClientResponse<T>> {
    let data = null;
    let bodyText = "";
    try {
      bodyText = await response.text();
      if (options.reviver || options.shouldParseDates) {
        data = JSON.parse(bodyText, (key, value) => {
          return this.reviveJsonValue(options, key, value);
        });
      } else {
        data = JSON.parse(bodyText);
      }
    } catch (error: unknown) {
      data = new ProblemDetails();
      data.detail = bodyText;
      data.title = `Unable to deserialize response data: ${
        error instanceof Error ? error.message : String(error)
      }`;
      data.setErrorMessage(data.title);
    }

    const jsonResponse = response as FetchClientResponse<T>;

    if (
      !response.ok ||
      response.headers.get("Content-Type")?.startsWith(
        "application/problem+json",
      )
    ) {
      jsonResponse.problem = Object.assign(new ProblemDetails(), data);
      jsonResponse.data = null;
      return jsonResponse;
    }

    jsonResponse.problem = new ProblemDetails();
    jsonResponse.data = data;

    return jsonResponse;
  }

  private reviveJsonValue(
    options: RequestOptions,
    key: string,
    value: unknown,
  ): unknown {
    let revivedValued = value;

    if (options.reviver) {
      revivedValued = options.reviver.call(this, key, revivedValued);
    }

    if (options.shouldParseDates) {
      revivedValued = this.tryParseDate(key, revivedValued);
    }

    return revivedValued;
  }

  private tryParseDate(_key: string, value: unknown): unknown {
    if (typeof value !== "string") {
      return value;
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return value;
  }

  private buildRequestInit(
    method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE",
    body: object | string | FormData | undefined,
    options: RequestOptions | undefined,
  ): RequestInitWithObjectBody {
    const isFormData = typeof FormData !== "undefined" &&
      body instanceof FormData;
    const isJsonLikeObject = body !== undefined && body !== null &&
      typeof body === "object" && !isFormData;

    const headers: Record<string, string> = {};
    if (isJsonLikeObject) {
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

  private buildJsonRequestOptions(
    options: RequestOptions | undefined,
  ): RequestOptions {
    return {
      headers: {
        "Accept": "application/json, application/problem+json",
        ...options?.headers,
      },
      ...options,
    };
  }

  private problemToResponse<T>(
    problem: ProblemDetails,
    url: string,
  ): FetchClientResponse<T> {
    const headers = new Headers();
    headers.set("Content-Type", "application/problem+json");

    return {
      url,
      status: problem.status ?? 422,
      statusText: problem.title ?? "Unprocessable Entity",
      body: null,
      bodyUsed: true,
      ok: false,
      headers: headers,
      redirected: false,
      problem: problem,
      data: null,
      meta: { links: {} },
      type: "basic",
      json: () => new Promise((resolve) => resolve(problem)),
      text: () => new Promise((resolve) => resolve(JSON.stringify(problem))),
      arrayBuffer: () => new Promise((resolve) => resolve(new ArrayBuffer(0))),
      // @ts-ignore: New in Deno 1.44
      bytes: () => new Promise((resolve) => resolve(new Uint8Array())),
      blob: () => new Promise((resolve) => resolve(new Blob())),
      formData: () => new Promise((resolve) => resolve(new FormData())),
      clone: () => {
        throw new Error("Not implemented");
      },
    };
  }

  private buildUrl(
    url: string,
    options: RequestOptions | undefined,
  ): { builtUrl: string; absoluteUrl: string } {
    let builtUrl = url;

    if (!builtUrl.startsWith("http") && this.options?.baseUrl) {
      if (this.options.baseUrl.endsWith("/") || builtUrl.startsWith("/")) {
        builtUrl = this.options.baseUrl + builtUrl;
      } else {
        builtUrl = this.options.baseUrl + "/" + builtUrl;
      }
    }

    const isAbsoluteUrl = builtUrl.startsWith("http");

    let parsed: URL | undefined = undefined;
    if (isAbsoluteUrl) {
      parsed = new URL(builtUrl);
    } else if (
      globalThis.location?.origin &&
      globalThis.location?.origin.startsWith("http")
    ) {
      if (builtUrl.startsWith("/")) {
        parsed = new URL(builtUrl, globalThis.location.origin);
      } else {
        parsed = new URL(builtUrl, globalThis.location.origin + "/");
      }
    } else {
      if (builtUrl.startsWith("/")) {
        parsed = new URL(builtUrl, "http://localhost");
      } else {
        parsed = new URL(builtUrl, "http://localhost/");
      }
    }

    if (options?.params) {
      for (const [key, value] of Object.entries(options?.params)) {
        if (
          value !== undefined && value !== null && !parsed.searchParams.has(key)
        ) {
          parsed.searchParams.set(key, value as string);
        }
      }
    }

    builtUrl = parsed.toString();

    const result = isAbsoluteUrl
      ? builtUrl
      : `${parsed.pathname}${parsed.search}`;

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

    if (
      options?.expectedStatusCodes &&
      options.expectedStatusCodes.includes(response.status)
    ) {
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
    response.problem.title = `Unexpected status code: ${response.status}`;
    response.problem.setErrorMessage(response.problem.title);

    throw new FetchClientError(response);
  }
}
