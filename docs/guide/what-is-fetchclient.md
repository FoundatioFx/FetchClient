# What is FetchClient?

FetchClient is a tiny library that makes working with `fetch` delightful. It provides a typed, ergonomic API for making HTTP requests with built-in support for common patterns like caching, middleware, rate limiting, and error handling.

**Two API styles** - Use simple functions or classes, whichever you prefer:

```ts
// Functional - no classes needed
import { getJSON, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");
const { data } = await getJSON<User>("/users/1");
```

```ts
// Class-based - if you prefer
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient({ baseUrl: "https://api.example.com" });
const { data } = await client.getJSON<User>("/users/1");
```

Both styles have full access to all features - caching, middleware, rate limiting, circuit breaker, and more.

## Features

### Typed JSON Helpers

Get fully typed responses with simple method calls:

```ts
import { getJSON } from "@foundatiofx/fetchclient";

type User = { id: number; name: string; email: string };

const { data } = await getJSON<User>("/api/users/1");
// data is typed as User | undefined
```

### Response Caching

Cache responses with TTL and invalidate by key or tag:

```ts
await client.getJSON("/api/users", {
  cacheKey: ["users"],
  cacheDuration: 60000,
  cacheTags: ["user-data"],
});

// Later: invalidate all user-related cache
client.cache.deleteByTag("user-data");
```

### Middleware

Intercept requests and responses for logging, authentication, error handling, and more:

```ts
provider.useMiddleware(async (ctx, next) => {
  ctx.request.headers.set("Authorization", `Bearer ${token}`);
  await next();
  console.log(`${ctx.request.url}: ${ctx.response?.status}`);
});
```

### Rate Limiting

Prevent overwhelming APIs with built-in rate limiting:

```ts
provider.usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
  updateFromHeaders: true,
});
```

### Circuit Breaker

Prevent cascading failures when services go down:

```ts
provider.useCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});
```

### Timeouts & Cancellation

Control request timeouts with ease:

```ts
await client.getJSON("/api/data", { timeout: 5000 });

// Or use AbortSignal
const controller = new AbortController();
await client.getJSON("/api/data", { signal: controller.signal });
```

### Error Handling

RFC 7807 Problem Details support with customizable error handling:

```ts
const response = await client.postJSON("/api/users", data);

if (!response.ok) {
  console.log(response.problem.title);   // "Validation Error"
  console.log(response.problem.errors);  // { email: ["Invalid format"] }
}
```

### Testing

Mock HTTP requests without network calls:

```ts
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

const mocks = new MockRegistry();
mocks.onGet("/api/users").reply(200, [{ id: 1 }]);
mocks.install(provider);
```

## FetchClient vs Axios

| Feature | FetchClient | Axios |
| ------- | ----------- | ----- |
| **Bundle size** | ~5KB | ~13KB |
| **Built on** | Native `fetch` | XMLHttpRequest |
| **Response caching** | Built-in with TTL & tags | Requires adapter |
| **Rate limiting** | Built-in | Not included |
| **Circuit breaker** | Built-in | Not included |
| **Request mocking** | Built-in MockRegistry | Requires axios-mock-adapter |
| **TypeScript** | First-class | Good support |
| **Problem Details** | Built-in RFC 7807 | Manual parsing |
| **Interceptors** | Middleware pattern | Request/response interceptors |
| **Cancellation** | Native AbortSignal | CancelToken (deprecated) + AbortSignal |
| **Browser support** | Modern browsers | IE11+ |

### When to Choose FetchClient

- You want **built-in caching** without external dependencies
- You need **rate limiting** or **circuit breaker** patterns
- You prefer the native `fetch` API and modern JavaScript
- You want **smaller bundle size**
- You're building for **Deno** or modern environments

### When to Choose Axios

- You need **IE11 support**
- You're already using axios in your project
- You need **upload progress** events (fetch doesn't support this well)
- You prefer axios's API style

### Code Comparison

**Axios:**

```ts
import axios from "axios";

const instance = axios.create({
  baseURL: "https://api.example.com",
});

instance.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const { data } = await instance.get<User>("/users/1");
```

**FetchClient (functional):**

```ts
import { getJSON, setBaseUrl, useMiddleware } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");
useMiddleware(async (ctx, next) => {
  ctx.request.headers.set("Authorization", `Bearer ${token}`);
  await next();
});

const { data } = await getJSON<User>("/users/1");
```

**FetchClient (class-based):**

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");
provider.useMiddleware(async (ctx, next) => {
  ctx.request.headers.set("Authorization", `Bearer ${token}`);
  await next();
});

const client = provider.getFetchClient();
const { data } = await client.getJSON<User>("/users/1");
```

The key difference: FetchClient includes caching, rate limiting, and circuit breaker out of the box, while axios requires additional libraries for these features.

## When to Use FetchClient

FetchClient is ideal when you need:

- **Type safety** - Strongly typed JSON responses
- **Caching** - Built-in response caching with TTL
- **Middleware** - Request/response interception
- **Resilience** - Rate limiting and circuit breaker patterns
- **Testing** - Easy HTTP mocking
- **Cross-platform** - Works in Deno, Node, and browsers

## Functional vs Class API

Both styles have **full access to all features**. Choose based on your preference:

### Functional Style

No classes, no `new` keyword - just functions:

```ts
import { getJSON, postJSON, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const { data } = await getJSON<User>("/users/1");
await postJSON("/users", { name: "Alice" });
```

Or use `getFetchClient()` for fewer imports when making multiple request types:

```ts
import { getFetchClient, setBaseUrl, useMiddleware } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");
useMiddleware(loggingMiddleware);

const client = getFetchClient();
const { data } = await client.getJSON<User>("/users/1");
await client.postJSON("/users", { name: "Alice" });
```

### Class-Based Style

If you prefer working with class instances:

```ts
import { FetchClient, FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");
provider.useMiddleware(loggingMiddleware);
provider.useRateLimit({ maxRequests: 100, windowSeconds: 60 });

const client = provider.getFetchClient();
const { data } = await client.getJSON<User>("/users/1");
```

The functional API is a thin wrapper around a [default provider](/guide/provider#default-provider) - both approaches use the same underlying code.

## Next Steps

- [Getting Started](/guide/getting-started) - Install and make your first request
- [Caching](/guide/caching) - Learn about response caching and cache tags
- [Middleware](/guide/middleware) - Intercept and modify requests
- [Rate Limiting](/guide/rate-limiting) - Prevent API overload
- [Circuit Breaker](/guide/circuit-breaker) - Handle service failures gracefully
- [Testing](/guide/testing) - Mock HTTP in your tests
