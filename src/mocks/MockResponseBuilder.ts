import type { MockDefinition } from "./types.ts";

/**
 * Fluent builder for configuring mock responses.
 * @template T The type of the registry (for chaining)
 */
export class MockResponseBuilder<T> {
  #mock: MockDefinition;
  #registry: T;

  constructor(mock: MockDefinition, registry: T) {
    this.#mock = mock;
    this.#registry = registry;
  }

  /**
   * Sets the response status, data, and optional headers.
   * @param status - HTTP status code
   * @param data - Response data (will be JSON stringified)
   * @param headers - Optional response headers
   * @returns The registry for chaining
   */
  reply(
    status: number,
    data?: unknown,
    headers?: Record<string, string>,
  ): T {
    this.#mock.status = status;
    this.#mock.data = data;
    this.#mock.headers = headers;
    return this.#registry;
  }

  /**
   * Sets a one-time response that is removed after the first match.
   * @param status - HTTP status code
   * @param data - Response data (will be JSON stringified)
   * @param headers - Optional response headers
   * @returns The registry for chaining
   */
  replyOnce(
    status: number,
    data?: unknown,
    headers?: Record<string, string>,
  ): T {
    this.#mock.once = true;
    return this.reply(status, data, headers);
  }

  /**
   * Simulates a network error by throwing a TypeError.
   * @param message - Error message (default: "Network error")
   * @returns The registry for chaining
   */
  networkError(message = "Network error"): T {
    this.#mock.networkError = message;
    return this.#registry;
  }

  /**
   * Simulates a timeout by throwing a TimeoutError.
   * @returns The registry for chaining
   */
  timeout(): T {
    this.#mock.timeout = true;
    return this.#registry;
  }

  /**
   * Passes the request through to the real fetch implementation.
   * @returns The registry for chaining
   */
  passthrough(): T {
    this.#mock.passthrough = true;
    return this.#registry;
  }

  /**
   * Adds header matching requirements for this mock.
   * @param headers - Headers that must be present and match
   * @returns This builder for further configuration
   */
  withHeaders(headers: Record<string, string>): this {
    this.#mock.headerMatchers = headers;
    return this;
  }

  /**
   * Adds body matching requirements for this mock.
   * @param body - Exact body to match, or a predicate function
   * @returns This builder for further configuration
   */
  withBody(body: unknown | ((body: unknown) => boolean)): this {
    this.#mock.bodyMatcher = body;
    return this;
  }

  /**
   * Adds a delay before returning the response.
   * @param ms - Delay in milliseconds
   * @returns This builder for further configuration
   */
  delay(ms: number): this {
    this.#mock.delay = ms;
    return this;
  }
}
