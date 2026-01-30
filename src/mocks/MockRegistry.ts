import type { FetchClient } from "../FetchClient.ts";
import type { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockHistoryImpl } from "./MockHistory.ts";
import { MockResponseBuilder } from "./MockResponseBuilder.ts";
import type { MockDefinition, MockHistory } from "./types.ts";

type Fetch = typeof globalThis.fetch;

/**
 * A registry for defining mock responses that can be installed on a
 * FetchClient or FetchClientProvider, or used as a standalone fetch replacement.
 *
 * @example Install on FetchClientProvider
 * ```typescript
 * const mocks = new MockRegistry();
 * mocks.onGet('/api/users').reply(200, [{ id: 1 }]);
 *
 * const provider = new FetchClientProvider();
 * mocks.install(provider);
 *
 * const client = provider.getFetchClient();
 * const response = await client.getJSON('/api/users');
 * ```
 *
 * @example Use as standalone fetch replacement
 * ```typescript
 * const mocks = new MockRegistry();
 * mocks.onGet('/api/users').reply(200, [{ id: 1 }]);
 *
 * // Use directly as fetch
 * const response = await mocks.fetch('/api/users');
 *
 * // Or pass to any library expecting a fetch function
 * const client = new SomeHttpClient({ fetch: mocks.fetch });
 * ```
 */
export class MockRegistry {
  #mocks: MockDefinition[] = [];
  #history = new MockHistoryImpl();
  #target: FetchClientProvider | null = null;
  #originalFetch: Fetch | undefined = undefined;

  /**
   * Creates a mock for GET requests matching the given URL.
   * @param url - URL string or RegExp to match
   */
  onGet(url: string | RegExp): MockResponseBuilder<MockRegistry> {
    return this.#addMock("GET", url);
  }

  /**
   * Creates a mock for POST requests matching the given URL.
   * @param url - URL string or RegExp to match
   */
  onPost(url: string | RegExp): MockResponseBuilder<MockRegistry> {
    return this.#addMock("POST", url);
  }

  /**
   * Creates a mock for PUT requests matching the given URL.
   * @param url - URL string or RegExp to match
   */
  onPut(url: string | RegExp): MockResponseBuilder<MockRegistry> {
    return this.#addMock("PUT", url);
  }

  /**
   * Creates a mock for PATCH requests matching the given URL.
   * @param url - URL string or RegExp to match
   */
  onPatch(url: string | RegExp): MockResponseBuilder<MockRegistry> {
    return this.#addMock("PATCH", url);
  }

  /**
   * Creates a mock for DELETE requests matching the given URL.
   * @param url - URL string or RegExp to match
   */
  onDelete(url: string | RegExp): MockResponseBuilder<MockRegistry> {
    return this.#addMock("DELETE", url);
  }

  /**
   * Creates a mock for any HTTP method matching the given URL.
   * @param url - URL string or RegExp to match
   */
  onAny(url: string | RegExp): MockResponseBuilder<MockRegistry> {
    return this.#addMock(null, url);
  }

  #addMock(
    method: string | null,
    url: string | RegExp,
  ): MockResponseBuilder<MockRegistry> {
    const mock: MockDefinition = {
      method,
      url,
      status: 200,
      once: false,
      passthrough: false,
      timeout: false,
    };
    this.#mocks.push(mock);
    return new MockResponseBuilder(mock, this);
  }

  /**
   * Installs the mock registry on a FetchClient or FetchClientProvider.
   * Replaces the fetch implementation to intercept requests.
   *
   * @param target - The FetchClient or FetchClientProvider to install on
   * @throws Error if already installed on another target
   */
  install(target: FetchClientProvider | FetchClient): void {
    if (this.#target) {
      throw new Error(
        "MockRegistry is already installed. Call restore() first.",
      );
    }

    // If target is FetchClient, use its provider
    const provider =
      "provider" in target && typeof target.provider !== "undefined"
        ? (target as FetchClient).provider
        : target as FetchClientProvider;

    this.#target = provider;
    this.#originalFetch = provider.fetch;

    // Replace fetch with our mock handler
    provider.fetch = ((
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      return this.#handleRequest(input, init);
    }) as typeof provider.fetch;
  }

  /**
   * Restores the original fetch implementation.
   */
  restore(): void {
    if (!this.#target) return;

    this.#target.fetch = this.#originalFetch;
    this.#target = null;
    this.#originalFetch = undefined;
  }

  async #handleRequest(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const signal = init?.signal;

    // Check if already aborted
    if (signal?.aborted) {
      throw signal.reason;
    }

    const request = new Request(input, init);
    this.#history.record(request);

    const mock = this.#match(request);
    if (!mock) {
      // No mock found - call original fetch or global fetch
      if (this.#originalFetch) {
        return this.#originalFetch(input, init);
      }
      return fetch(input, init);
    }

    if (mock.passthrough) {
      if (this.#originalFetch) {
        return this.#originalFetch(input, init);
      }
      return fetch(input, init);
    }

    if (mock.delay) {
      await this.#delayWithAbort(mock.delay, signal);
    }

    // Check again after delay
    if (signal?.aborted) {
      throw signal.reason;
    }

    if (mock.networkError) {
      throw new TypeError(mock.networkError);
    }

    if (mock.timeout) {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    }

    // Build mock response
    const headers = new Headers(mock.headers);
    if (mock.data !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return new Response(
      mock.data !== undefined ? JSON.stringify(mock.data) : null,
      { status: mock.status, headers },
    );
  }

  /**
   * Delay that respects abort signals.
   */
  #delayWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);

      if (signal) {
        const abortHandler = () => {
          clearTimeout(timeoutId);
          reject(signal.reason);
        };

        if (signal.aborted) {
          clearTimeout(timeoutId);
          reject(signal.reason);
          return;
        }

        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });
  }

  #match(request: Request): MockDefinition | null {
    for (let i = 0; i < this.#mocks.length; i++) {
      const mock = this.#mocks[i];

      // Check method
      if (mock.method && mock.method !== request.method) continue;

      // Check URL
      const url = request.url;
      if (mock.url instanceof RegExp) {
        if (!mock.url.test(url)) continue;
      } else {
        // Match if URL ends with the pattern or contains it
        if (!url.endsWith(mock.url) && !url.includes(mock.url)) continue;
      }

      // Check headers if specified
      if (mock.headerMatchers) {
        let headersMatch = true;
        for (const [key, value] of Object.entries(mock.headerMatchers)) {
          if (request.headers.get(key) !== value) {
            headersMatch = false;
            break;
          }
        }
        if (!headersMatch) continue;
      }

      // Found a match - remove if once
      if (mock.once) {
        this.#mocks.splice(i, 1);
      }

      return mock;
    }

    return null;
  }

  /**
   * Gets the recorded request history.
   */
  get history(): MockHistory {
    return this.#history;
  }

  /**
   * Gets the mock fetch function for standalone use.
   * This allows using MockRegistry with any code that accepts a fetch function.
   *
   * @example
   * ```typescript
   * const mocks = new MockRegistry();
   * mocks.onGet('/api/data').reply(200, { value: 42 });
   *
   * // Use directly
   * const response = await mocks.fetch('/api/data');
   *
   * // Or pass to other libraries
   * const client = new SomeClient({ fetch: mocks.fetch });
   * ```
   */
  get fetch(): Fetch {
    return ((
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      return this.#handleRequest(input, init);
    }) as Fetch;
  }

  /**
   * Clears all mocks and history.
   */
  reset(): void {
    this.resetMocks();
    this.resetHistory();
  }

  /**
   * Clears all mocks but keeps history.
   */
  resetMocks(): void {
    this.#mocks = [];
  }

  /**
   * Clears history but keeps mocks.
   */
  resetHistory(): void {
    this.#history.clear();
  }
}
