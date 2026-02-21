# Getting Started

## Install

```bash
npm install @foundatiofx/fetchclient
```

## Quick Usage

FetchClient offers multiple styles. Choose whichever you prefer - all have full
access to all features.

### Default Export (Recommended)

The simplest way to use FetchClient:

```ts
import fc from "@foundatiofx/fetchclient";

// GET with typed JSON response
const { data: user } = await fc.getJSON<User>("/api/users/1");

// POST with JSON body
const { data: created } = await fc.postJSON<User>("/users", { name: "Alice" });

// Full response access (status, headers, problem details)
const response = await fc.getJSON<User[]>("/users");
console.log(response.status, response.ok, response.data);
```

### Functional Style

Use named function exports:

```ts
import { getJSON, postJSON, setBaseUrl } from "@foundatiofx/fetchclient";

// Configure once at app startup
setBaseUrl("https://api.example.com");

// Use anywhere in your app
const { data: users } = await getJSON<User[]>("/users");
const { data: created } = await postJSON<User>("/users", { name: "Alice" });
```

Or use `useFetchClient()` if you prefer working with a client instance:

```ts
import { setBaseUrl, useFetchClient } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const client = useFetchClient();
const { data: users } = await client.getJSON<User[]>("/users");
const { data: created } = await client.postJSON<User>("/users", {
  name: "Alice",
});
```

## Adding Middleware

Use the default export for convenient middleware setup:

```ts
import fc from "@foundatiofx/fetchclient";

// Built-in middleware factories
fc.use(fc.middleware.retry({ limit: 3 }));
fc.use(fc.middleware.rateLimit({ maxRequests: 100, windowSeconds: 60 }));
fc.use(fc.middleware.circuitBreaker({ failureThreshold: 5 }));
```

Or use custom middleware:

```ts
import { useMiddleware } from "@foundatiofx/fetchclient";

useMiddleware(async (ctx, next) => {
  console.log("→", ctx.request.url);
  await next();
  console.log("←", ctx.response?.status);
});
```

## Authentication

```ts
import { setAccessTokenFunc } from "@foundatiofx/fetchclient";

setAccessTokenFunc(() => localStorage.getItem("token"));

// All requests automatically include Authorization: Bearer <token>
```

## Complete Setup Example

```ts
// app-init.ts - Configure once at startup
import fc from "@foundatiofx/fetchclient";
import { setAccessTokenFunc, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

setAccessTokenFunc(() => localStorage.getItem("token"));

// Add middleware using fc.use() with built-in factories
fc.use(fc.middleware.retry({ limit: 3 }));
fc.use(
  fc.middleware.perDomainRateLimit({ maxRequests: 100, windowSeconds: 60 }),
);
fc.use(
  fc.middleware.circuitBreaker({ failureThreshold: 5, openDurationMs: 30000 }),
);

// Custom logging middleware
fc.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.request.url}: ${Date.now() - start}ms`);
});
```

```ts
// anywhere.ts - Use the API
import fc from "@foundatiofx/fetchclient";

// Simple usage
const { data: users } = await fc.getJSON<User[]>("/users");

// With full response access
const response = await fc.postJSON<User>("/users", { name: "Alice" });
if (response.ok) {
  console.log("Created:", response.data);
}
```

## Next Steps

- [Caching](/guide/caching) - Cache responses with TTL and tags
- [Middleware](/guide/middleware) - Intercept and modify requests
- [Rate Limiting](/guide/rate-limiting) - Prevent API overload
- [Circuit Breaker](/guide/circuit-breaker) - Handle service failures
- [Error Handling](/guide/error-handling) - Handle errors gracefully
- [Testing](/guide/testing) - Mock HTTP in your tests
