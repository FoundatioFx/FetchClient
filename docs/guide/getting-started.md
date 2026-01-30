# Getting Started

## Install

```bash
npm install @foundatiofx/fetchclient
```

## Quick Usage

FetchClient offers two styles: **functional** and **class-based**. Choose
whichever you prefer - both have full access to all features.

### Functional Style (Recommended)

Use simple functions:

```ts
import { getJSON, postJSON, setBaseUrl } from "@foundatiofx/fetchclient";

// Configure once at app startup
setBaseUrl("https://api.example.com");

// Use anywhere in your app
const { data: users } = await getJSON<User[]>("/users");
const { data: created } = await postJSON<User>("/users", { name: "Alice" });
```

Or use `getFetchClient()` if you prefer working with a client instance:

```ts
import { getFetchClient, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const client = getFetchClient();
const { data: users } = await client.getJSON<User[]>("/users");
const { data: created } = await client.postJSON<User>("/users", {
  name: "Alice",
});
```

## Adding Middleware

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
import {
  setAccessTokenFunc,
  setBaseUrl,
  useCircuitBreaker,
  useMiddleware,
  usePerDomainRateLimit,
} from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

setAccessTokenFunc(() => localStorage.getItem("token"));

useMiddleware(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.request.url}: ${Date.now() - start}ms`);
});

usePerDomainRateLimit({ maxRequests: 100, windowSeconds: 60 });
useCircuitBreaker({ failureThreshold: 5, openDurationMs: 30000 });
```

```ts
// anywhere.ts - Use the API
import { getJSON, postJSON } from "@foundatiofx/fetchclient";

const { data } = await getJSON<User[]>("/users");
```

## Next Steps

- [Caching](/guide/caching) - Cache responses with TTL and tags
- [Middleware](/guide/middleware) - Intercept and modify requests
- [Rate Limiting](/guide/rate-limiting) - Prevent API overload
- [Circuit Breaker](/guide/circuit-breaker) - Handle service failures
- [Error Handling](/guide/error-handling) - Handle errors gracefully
- [Testing](/guide/testing) - Mock HTTP in your tests
