# Testing

FetchClient includes `MockRegistry` for mocking HTTP responses in tests. No network requests are made, and you have full control over responses.

## Installation

MockRegistry is available as a separate import:

```ts
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";
```

## Basic Usage

```ts
import { FetchClient } from "@foundatiofx/fetchclient";
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

// Create mock registry
const mocks = new MockRegistry();

// Define mock responses
mocks.onGet("/api/users").reply(200, [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
]);

// Install on client
const client = new FetchClient({ baseUrl: "https://api.example.com" });
mocks.install(client);

// Make requests - they're mocked!
const response = await client.getJSON("/api/users");
// response.data = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]

// Clean up
mocks.restore();
```

## Matching HTTP Methods

```ts
mocks.onGet("/api/users").reply(200, []);
mocks.onPost("/api/users").reply(201, { id: 1 });
mocks.onPut("/api/users/1").reply(200, { id: 1, updated: true });
mocks.onPatch("/api/users/1").reply(200, { id: 1, patched: true });
mocks.onDelete("/api/users/1").reply(204);

// Match any method
mocks.onAny("/api/health").reply(200, { status: "ok" });
```

## URL Matching

### Exact Match

```ts
mocks.onGet("/api/users").reply(200, []);
// Matches: https://example.com/api/users
```

### Regex Match

```ts
mocks.onGet(/\/api\/users\/\d+/).reply(200, { id: 1, name: "User" });
// Matches: /api/users/1, /api/users/123, etc.
```

### Partial Match

URLs are matched if they end with or contain the pattern:

```ts
mocks.onGet("/users").reply(200, []);
// Matches: /api/users, /v1/api/users, etc.
```

## Response Options

### JSON Response

```ts
mocks.onGet("/api/data").reply(200, { key: "value" });
// Content-Type: application/json is set automatically
```

### Custom Headers

```ts
mocks.onGet("/api/data")
  .reply(200, { data: "value" })
  .withHeaders({ "X-Custom": "header" });
```

### Empty Response

```ts
mocks.onDelete("/api/users/1").reply(204);
// No body, just status code
```

## One-Time Mocks

Use `replyOnce` for mocks that should only match once:

```ts
mocks.onPost("/api/users").replyOnce(201, { id: 1 });

await client.postJSON("/api/users", {}); // Returns 201, { id: 1 }
await client.postJSON("/api/users", {}); // Falls through to real fetch (or no match)
```

## Simulating Errors

### Network Errors

```ts
mocks.onGet("/api/flaky").networkError("Connection refused");
// Throws TypeError("Connection refused")
```

### Timeouts

```ts
mocks.onGet("/api/slow").timeout();
// Throws DOMException with name "TimeoutError"
```

### Delayed Responses

```ts
mocks.onGet("/api/data")
  .reply(200, { data: "value" })
  .withDelay(1000); // 1 second delay
```

## Conditional Matching

Match based on request headers:

```ts
mocks
  .onGet("/api/data")
  .withHeaders({ Authorization: "Bearer token123" })
  .reply(200, { authorized: true });

mocks.onGet("/api/data").reply(401, { error: "Unauthorized" });
```

## Request History

Track what requests were made:

```ts
const mocks = new MockRegistry();
mocks.onGet("/api/users").reply(200, []);
mocks.onPost("/api/users").reply(201, {});

mocks.install(client);

await client.getJSON("/api/users");
await client.postJSON("/api/users", { name: "Alice" });

// Check history
console.log(mocks.history.all.length); // 2
console.log(mocks.history.get.length); // 1
console.log(mocks.history.post.length); // 1

// Access request details
const postRequest = mocks.history.post[0];
console.log(postRequest.url); // "https://example.com/api/users"
console.log(postRequest.method); // "POST"
```

## Standalone Fetch Replacement

Use `mocks.fetch` directly without installing on a client:

```ts
const mocks = new MockRegistry();
mocks.onGet("/api/data").reply(200, { value: 42 });

// Use directly
const response = await mocks.fetch("https://example.com/api/data");
const data = await response.json();
// data = { value: 42 }

// Pass to any library expecting a fetch function
const customClient = new SomeHttpClient({ fetch: mocks.fetch });
```

## Resetting Mocks

```ts
// Clear everything (mocks and history)
mocks.reset();

// Clear only mocks, keep history
mocks.resetMocks();

// Clear only history, keep mocks
mocks.resetHistory();
```

## Test Setup Patterns

### Per-Test Setup

```ts
describe("User API", () => {
  let client: FetchClient;
  let mocks: MockRegistry;

  beforeEach(() => {
    client = new FetchClient({ baseUrl: "https://api.example.com" });
    mocks = new MockRegistry();
    mocks.install(client);
  });

  afterEach(() => {
    mocks.restore();
    mocks.reset();
  });

  it("should fetch users", async () => {
    mocks.onGet("/api/users").reply(200, [{ id: 1 }]);

    const response = await client.getJSON("/api/users");

    expect(response.data).toEqual([{ id: 1 }]);
    expect(mocks.history.get.length).toBe(1);
  });
});
```

### Shared Mock Setup

```ts
function setupMocks() {
  const mocks = new MockRegistry();

  // Common mocks
  mocks.onGet("/api/health").reply(200, { status: "ok" });
  mocks.onGet("/api/config").reply(200, { version: "1.0" });

  return mocks;
}

describe("App", () => {
  let client: FetchClient;
  let mocks: MockRegistry;

  beforeEach(() => {
    client = new FetchClient({ baseUrl: "https://api.example.com" });
    mocks = setupMocks();
    mocks.install(client);
  });

  afterEach(() => {
    mocks.restore();
  });

  it("should work", async () => {
    // Add test-specific mocks
    mocks.onGet("/api/users").reply(200, []);

    // Test...
  });
});
```

## Testing with Caching

MockRegistry records all requests, so you can verify cache behavior:

```ts
it("should use cache on second request", async () => {
  mocks.onGet("/api/data").reply(200, { value: 1 });

  // First request - hits mock
  await client.getJSON("/api/data", {
    cacheKey: ["data"],
    cacheDuration: 60000,
  });

  // Second request - should use cache
  await client.getJSON("/api/data", {
    cacheKey: ["data"],
    cacheDuration: 60000,
  });

  // Only one request was made (second was cached)
  expect(mocks.history.get.length).toBe(1);
});
```

## Testing Error Scenarios

```ts
it("should handle 404", async () => {
  mocks.onGet("/api/users/999").reply(404, {
    title: "Not Found",
    detail: "User not found",
  });

  const response = await client.getJSON("/api/users/999", {
    expectedStatusCodes: [404],
  });

  expect(response.status).toBe(404);
  expect(response.problem.detail).toBe("User not found");
});

it("should handle network errors", async () => {
  mocks.onGet("/api/data").networkError("Connection refused");

  await expect(client.getJSON("/api/data")).rejects.toThrow(
    "Connection refused",
  );
});

it("should handle timeouts", async () => {
  mocks.onGet("/api/slow").timeout();

  const response = await client.getJSON("/api/slow");
  expect(response.status).toBe(408);
});
```

## Testing Circuit Breaker

```ts
it("should open circuit after failures", async () => {
  const client = new FetchClient();
  client.useCircuitBreaker({ failureThreshold: 3 });

  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Server error" });
  mocks.install(client);

  // Trigger failures
  for (let i = 0; i < 3; i++) {
    await client.getJSON("/api/data", { expectedStatusCodes: [500] });
  }

  // Circuit should be open now
  const response = await client.getJSON("/api/data");
  expect(response.status).toBe(503); // Circuit open

  // Only 3 actual requests were made
  expect(mocks.history.get.length).toBe(3);
});
```

## Deno Testing

```ts
import { assertEquals } from "@std/assert";
import { FetchClient } from "@foundatiofx/fetchclient";
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

Deno.test("fetches users", async () => {
  const client = new FetchClient();
  const mocks = new MockRegistry();

  mocks.onGet("/api/users").reply(200, [{ id: 1 }]);
  mocks.install(client);

  const response = await client.getJSON("/api/users");

  assertEquals(response.data, [{ id: 1 }]);

  mocks.restore();
});
```
