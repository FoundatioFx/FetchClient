# Usage Examples

This page consolidates common examples from the README.

## Model Validator

```ts
import {
  FetchClient,
  ProblemDetails,
  setModelValidator,
} from "@foundatiofx/fetchclient";

setModelValidator(async (data: object | null) => {
  // use zod or any other validator
  const problem = new ProblemDetails();
  const d = data as { password: string };
  if (d?.password?.length < 6) {
    problem.errors.password = [
      "Password must be longer than or equal to 6 characters.",
    ];
  }
  return problem;
});

const client = new FetchClient();
const data = { email: "test@test", password: "test" };

const response = await client.postJSON(
  "https://jsonplaceholder.typicode.com/todos/1",
  data,
);

if (!response.ok) {
  console.log(response.problem.detail);
}
```

## Caching

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

type Todo = { userId: number; id: number; title: string; completed: boolean };

const client = new FetchClient();
const response = await client.getJSON<Todo>(
  `https://jsonplaceholder.typicode.com/todos/1`,
  {
    cacheKey: ["todos", "1"],
    cacheDuration: 1000 * 60, // 1 minute
  },
);

// Invalidate programmatically
client.cache.delete(["todos", "1"]);

// Invalidate by prefix
client.cache.deleteAll(["todos"]); // Removes all entries starting with "todos:"
```

## Cache Tagging

Use cache tags to group related cache entries and invalidate them together:

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

// Cache entries with shared tags
await client.getJSON("/api/users/1", {
  cacheKey: ["users", "1"],
  cacheTags: ["users", "user-data"],
});

await client.getJSON("/api/users/2", {
  cacheKey: ["users", "2"],
  cacheTags: ["users", "user-data"],
});

await client.getJSON("/api/posts/1", {
  cacheKey: ["posts", "1"],
  cacheTags: ["posts", "user-data"],
});

// Invalidate all user entries
client.cache.deleteByTag("users"); // Removes users/1 and users/2

// Invalidate all user-related data (users and posts)
client.cache.deleteByTag("user-data"); // Removes all three entries

// Check available tags
const tags = client.cache.getTags(); // ["posts"] after deleteByTag("users")

// Get tags for a specific entry
const entryTags = client.cache.getEntryTags(["posts", "1"]); // ["posts", "user-data"]
```

Tags are automatically cleaned up when entries expire or are deleted.

## Rate Limiting

```ts
import { FetchClient, useRateLimit } from "@foundatiofx/fetchclient";

useRateLimit({ maxRequests: 100, windowSeconds: 60 });

const client = new FetchClient();
await client.getJSON(`https://api.example.com/data`);
```

## Circuit Breaker

The circuit breaker pattern prevents cascading failures when an API goes down. When a service starts failing, the circuit "opens" and blocks further requests for a period, allowing the service time to recover.

### Basic Usage

```ts
import { FetchClientProvider, useCircuitBreaker } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");

// Enable circuit breaker
provider.useCircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  openDurationMs: 30000,  // Stay open for 30 seconds
  successThreshold: 2,    // Close after 2 successes in HALF_OPEN
});

const client = provider.getFetchClient();

// If API starts failing, circuit opens automatically
// Subsequent requests get 503 without hitting the API
const response = await client.getJSON("/users");
if (response.status === 503) {
  // Circuit is open - service is down
}
```

### Per-Domain Circuit Breaker

```ts
provider.usePerDomainCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});

// Each domain has its own circuit
await client.getJSON("https://api1.example.com/data"); // Circuit for api1
await client.getJSON("https://api2.example.com/data"); // Circuit for api2

// Failures on api1 don't affect api2's circuit
```

### Combined with Rate Limiting

```ts
provider.useRateLimit({ maxRequests: 100, windowSeconds: 60 });
provider.useCircuitBreaker({ failureThreshold: 5 });

// Rate limiter prevents overwhelming the API
// Circuit breaker stops requests when API is down
```

### Custom Failure Detection

By default, 5xx errors and 429 (rate limited) responses count as failures. You can customize this:

```ts
provider.useCircuitBreaker({
  failureThreshold: 3,
  isFailure: (response) => {
    // Only count 5xx errors as failures
    return response.status >= 500;
  },
});
```

### State Change Callbacks

```ts
provider.useCircuitBreaker({
  onStateChange: (from, to) => {
    console.log(`Circuit: ${from} -> ${to}`);
  },
  onOpen: (group) => {
    console.log(`Service ${group} is down!`);
  },
  onClose: (group) => {
    console.log(`Service ${group} recovered`);
  },
  onHalfOpen: (group) => {
    console.log(`Testing if ${group} recovered...`);
  },
});
```

### Manual Circuit Control

```ts
const breaker = provider.circuitBreaker!;

// Force open the circuit (e.g., during maintenance)
breaker.trip("https://api.example.com/users");

// Force close the circuit
breaker.reset("https://api.example.com/users");

// Check state
console.log(breaker.getState("https://api.example.com/users")); // "OPEN" | "CLOSED" | "HALF_OPEN"

// Get failure count
console.log(breaker.getFailureCount("https://api.example.com/users"));
```

### Circuit States

- **CLOSED**: Normal operation. Requests pass through, failures are tracked.
- **OPEN**: Circuit tripped. Requests immediately return 503 (Service Unavailable).
- **HALF_OPEN**: Testing recovery. Limited requests allowed to test if service recovered.

### Throwing Errors Instead of 503

```ts
import { CircuitOpenError } from "@foundatiofx/fetchclient";

provider.useCircuitBreaker({
  throwOnOpen: true, // Throw instead of returning 503
});

try {
  await client.getJSON("/users");
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.log(`Circuit open for group: ${error.group}`);
    console.log(`Retry after: ${error.retryAfter}ms`);
  }
}
```

## Request Timeout & Cancellation

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

// Timeout per request
await client.getJSON(`https://api.example.com/data`, { timeout: 5000 });

// AbortSignal
const controller = new AbortController();
setTimeout(() => controller.abort(), 1000);

await client.getJSON(`https://api.example.com/data`, {
  signal: controller.signal,
});
```

## Error Handling

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

try {
  await client.getJSON(`https://api.example.com/data`);
} catch (error) {
  if ((error as any).problem) {
    console.log((error as any).problem.title);
    console.log((error as any).problem.detail);
  }
}

// Or handle specific status codes
await client.getJSON(`https://api.example.com/data`, {
  expectedStatusCodes: [404, 500],
  errorCallback: (response) => {
    if (response.status === 404) {
      console.log("Resource not found");
      return true; // Don't throw
    }
  },
});
```

## Authentication

```ts
import { FetchClient, setAccessTokenFunc } from "@foundatiofx/fetchclient";

setAccessTokenFunc(() => localStorage.getItem("token"));

const client = new FetchClient();
await client.getJSON(`https://api.example.com/data`);
// Authorization: Bearer <token>
```

## Base URL

```ts
import { FetchClient, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const client = new FetchClient();
await client.getJSON(`/users/123`);
// Requests to https://api.example.com/users/123
```

## Loading State

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

client.loading.on((isLoading) => {
  console.log(`Loading: ${isLoading}`);
});

console.log(client.isLoading);
console.log(client.requestCount);
```

## Testing with MockRegistry

Use `MockRegistry` to mock HTTP responses in tests without making real network requests:

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

// Create mock registry and define responses
const mocks = new MockRegistry();
mocks.onGet("/api/users").reply(200, [{ id: 1, name: "Alice" }]);
mocks.onPost("/api/users").reply(201, { id: 2, name: "Bob" });

// Install on provider
const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");
mocks.install(provider);

// Use client as normal - requests are mocked
const client = provider.getFetchClient();
const response = await client.getJSON("/api/users");
// response.data = [{ id: 1, name: "Alice" }]

// Restore original fetch when done
mocks.restore();
```

### Standalone Fetch Replacement

Use `mocks.fetch` to get the mock fetch function directly, without installing on a provider. This is useful for mocking fetch in any context:

```ts
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

const mocks = new MockRegistry();
mocks.onGet("/api/data").reply(200, { value: 42 });

// Use directly as fetch
const response = await mocks.fetch("https://api.example.com/api/data");
const data = await response.json(); // { value: 42 }

// Or pass to any library expecting a fetch function
const client = new SomeHttpClient({ fetch: mocks.fetch });

// History is still recorded
console.log(mocks.history.all.length); // 1
```

### One-time Mocks

```ts
mocks.onPost("/api/users").replyOnce(201, { id: 1 });

await client.postJSON("/api/users", {}); // Returns 201
await client.postJSON("/api/users", {}); // Falls through to real fetch
```

### Error Simulation

```ts
mocks.onGet("/api/flaky").networkError("Connection refused");
mocks.onGet("/api/slow").timeout();
```

### Regex URL Matching

```ts
mocks.onGet(/\/api\/users\/\d+/).reply(200, { id: 1, name: "User" });

await client.getJSON("/api/users/123"); // Matches
await client.getJSON("/api/users/456"); // Matches
```

### Request History

```ts
await client.postJSON("/api/users", { name: "Test" });

console.log(mocks.history.post.length); // 1
console.log(mocks.history.all.length);  // 1
```

### Test Setup Pattern

```ts
const provider = new FetchClientProvider();
const mocks = new MockRegistry();

beforeEach(() => {
  mocks.install(provider);
});

afterEach(() => {
  mocks.restore();
  mocks.reset(); // Clear mocks and history
});
```
