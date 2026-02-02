import type { FetchClientResponse } from "./FetchClientResponse.ts";
import type { RequestOptions } from "./RequestOptions.ts";

/**
 * A promise that resolves to a FetchClientResponse with additional helper methods
 * for parsing the response body. This allows for a fluent API similar to ky:
 *
 * @example
 * ```typescript
 * // Await to get the full response
 * const response = await client.get("/api/users");
 *
 * // Or use helper methods for direct access to parsed body
 * const users = await client.get("/api/users").json<User[]>();
 * const html = await client.get("/page").text();
 * const file = await client.get("/file").blob();
 * ```
 */
export class ResponsePromise<T = unknown>
  implements PromiseLike<FetchClientResponse<T>> {
  readonly #responsePromise: Promise<FetchClientResponse<T>>;
  readonly #options?: RequestOptions;

  constructor(
    responsePromise: Promise<FetchClientResponse<T>>,
    options?: RequestOptions,
  ) {
    this.#responsePromise = responsePromise;
    this.#options = options;
  }

  /**
   * Implements PromiseLike interface so the ResponsePromise can be awaited.
   */
  then<TResult1 = FetchClientResponse<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: FetchClientResponse<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#responsePromise.then(onfulfilled, onrejected);
  }

  /**
   * Catches any errors from the response promise.
   */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<FetchClientResponse<T> | TResult> {
    return this.#responsePromise.catch(onrejected);
  }

  /**
   * Executes a callback when the promise settles (fulfilled or rejected).
   */
  finally(onfinally?: (() => void) | null): Promise<FetchClientResponse<T>> {
    return this.#responsePromise.finally(onfinally);
  }

  /**
   * Parses the response body as JSON.
   *
   * If the response was already parsed as JSON (via getJSON, postJSON, etc.),
   * returns the parsed data directly. Otherwise, parses the response body.
   *
   * @template TJson - The expected type of the JSON response
   * @returns A promise that resolves to the parsed JSON
   *
   * @example
   * ```typescript
   * const user = await client.get("/api/user/1").json<User>();
   * ```
   */
  async json<TJson = T>(): Promise<TJson> {
    const response = await this.#responsePromise;

    // If the response already has parsed data (from getJSON, etc.), return it
    if (response.data !== null && response.data !== undefined) {
      return response.data as unknown as TJson;
    }

    // Otherwise, parse the response body as JSON
    const data = await response.json();

    // Apply reviver and date parsing if options are set
    if (this.#options?.reviver || this.#options?.shouldParseDates) {
      return this.#reviveJson(data) as TJson;
    }

    return data as TJson;
  }

  /**
   * Returns the response body as text.
   *
   * @returns A promise that resolves to the response text
   *
   * @example
   * ```typescript
   * const html = await client.get("/page").text();
   * ```
   */
  async text(): Promise<string> {
    const response = await this.#responsePromise;
    return response.text();
  }

  /**
   * Returns the response body as a Blob.
   *
   * @returns A promise that resolves to the response as a Blob
   *
   * @example
   * ```typescript
   * const imageBlob = await client.get("/image.png").blob();
   * ```
   */
  async blob(): Promise<Blob> {
    const response = await this.#responsePromise;
    return response.blob();
  }

  /**
   * Returns the response body as an ArrayBuffer.
   *
   * @returns A promise that resolves to the response as an ArrayBuffer
   *
   * @example
   * ```typescript
   * const buffer = await client.get("/file").arrayBuffer();
   * ```
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    const response = await this.#responsePromise;
    return response.arrayBuffer();
  }

  /**
   * Returns the response body as FormData.
   *
   * @returns A promise that resolves to the response as FormData
   *
   * @example
   * ```typescript
   * const formData = await client.get("/form").formData();
   * ```
   */
  async formData(): Promise<FormData> {
    const response = await this.#responsePromise;
    return response.formData();
  }

  #reviveJson(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.#reviveJson(item));
    }

    if (typeof data === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.#reviveValue(key, this.#reviveJson(value));
      }
      return result;
    }

    return this.#reviveValue("", data);
  }

  #reviveValue(key: string, value: unknown): unknown {
    let revivedValue = value;

    if (this.#options?.reviver) {
      revivedValue = this.#options.reviver.call(this, key, revivedValue);
    }

    if (this.#options?.shouldParseDates) {
      revivedValue = this.#tryParseDate(revivedValue);
    }

    return revivedValue;
  }

  #tryParseDate(value: unknown): unknown {
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
}
