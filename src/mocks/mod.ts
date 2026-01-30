/**
 * Mock utilities for testing FetchClient.
 *
 * @example
 * ```typescript
 * import { FetchClientProvider } from "@foundatiofx/fetchclient";
 * import { MockRegistry } from "@foundatiofx/fetchclient/mocks";
 *
 * const mocks = new MockRegistry();
 * mocks.onGet('/api/users').reply(200, [{ id: 1 }]);
 *
 * const provider = new FetchClientProvider();
 * mocks.install(provider);
 *
 * const client = provider.getFetchClient();
 * const response = await client.getJSON('/api/users');
 *
 * mocks.restore();
 * ```
 *
 * @module
 */

export { MockRegistry } from "./MockRegistry.ts";
export { MockResponseBuilder } from "./MockResponseBuilder.ts";
export type { MockDefinition, MockHistory } from "./types.ts";
