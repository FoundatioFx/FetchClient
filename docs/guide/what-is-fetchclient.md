# What is FetchClient?

FetchClient is a tiny library that makes working with `fetch` delightful. It
provides a typed, ergonomic API for making HTTP requests with built-in support
for caching, middleware, rate limiting, and error handling.

## Two API Styles

FetchClient offers two equivalent API styles. Choose whichever fits your
preference:

### Class-Based API

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient({ baseUrl: "https://api.example.com" });

const { data } = await client.getJSON<User>("/users/1");
```

### Functional API

```ts
import { getJSON, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const { data } = await getJSON<User>("/users/1");
```

Both styles provide the same functionality. The functional API uses a shared
default provider, while the class-based API gives you explicit control over
client instances.

## Features

### Typed JSON Helpers

Get fully typed responses with simple method calls:

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

type User = { id: number; name: string; email: string };

const { data } = await client.getJSON<User>("/api/users/1");
// data is typed as User | undefined

const { data: created } = await client.postJSON<User>("/api/users", {
  name: "Alice",
});
```

Or with the functional API:

```ts
import { getJSON, postJSON } from "@foundatiofx/fetchclient";

const { data } = await getJSON<User>("/api/users/1");
const { data: created } = await postJSON<User>("/api/users", { name: "Alice" });
```

### Response Caching

Cache responses with TTL and invalidate by key or tag:

```ts
import { getCache, getJSON } from "@foundatiofx/fetchclient";

const { data } = await getJSON("/api/users", {
  cacheKey: ["users"],
  cacheDuration: 60000,
  cacheTags: ["user-data"],
});

getCache().deleteByTag("user-data");
```

### Middleware

Intercept requests and responses for logging, authentication, error handling,
and more:

```ts
import { useMiddleware } from "@foundatiofx/fetchclient";

useMiddleware(async (ctx, next) => {
  ctx.request.headers.set("Authorization", `Bearer ${token}`);
  await next();
  console.log(`${ctx.request.url}: ${ctx.response?.status}`);
});
```

### Rate Limiting

Prevent overwhelming APIs with built-in rate limiting:

```ts
import { usePerDomainRateLimit } from "@foundatiofx/fetchclient";

usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
  updateFromHeaders: true,
});
```

### Circuit Breaker

Prevent cascading failures when services go down:

```ts
import { useCircuitBreaker } from "@foundatiofx/fetchclient";

useCircuitBreaker({
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
  console.log(response.problem.title); // "Validation Error"
  console.log(response.problem.errors); // { email: ["Invalid format"] }
}
```

### Testing

Mock HTTP requests without network calls:

```ts
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

const mocks = new MockRegistry();
mocks.onGet("/api/users").reply(200, [{ id: 1 }]);

let client = new FetchClient();
mocks.install(client);

let response = await client.getJSON("/api/users");
```

## FetchClient vs Axios

| Feature              | FetchClient              | Axios                                  |
| -------------------- | ------------------------ | -------------------------------------- |
| **Bundle size**      | ~5KB                     | ~13KB                                  |
| **Built on**         | Native `fetch`           | XMLHttpRequest                         |
| **Response caching** | Built-in with TTL & tags | Requires adapter                       |
| **Rate limiting**    | Built-in                 | Not included                           |
| **Circuit breaker**  | Built-in                 | Not included                           |
| **Request mocking**  | Built-in MockRegistry    | Requires axios-mock-adapter            |
| **TypeScript**       | First-class              | Good support                           |
| **Problem Details**  | Built-in RFC 7807        | Manual parsing                         |
| **Cancellation**     | Native AbortSignal       | CancelToken (deprecated) + AbortSignal |
| **Browser support**  | Modern browsers          | IE11+                                  |

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

## Next Steps

- [Getting Started](/guide/getting-started) - Install and make your first
  request
- [Caching](/guide/caching) - Learn about response caching and cache tags
- [Middleware](/guide/middleware) - Intercept and modify requests
- [Rate Limiting](/guide/rate-limiting) - Prevent API overload
- [Circuit Breaker](/guide/circuit-breaker) - Handle service failures gracefully
- [Testing](/guide/testing) - Mock HTTP in your tests
