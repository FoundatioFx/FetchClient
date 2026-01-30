---
layout: home
hero:
  name: Foundatio FetchClient
  text: Typed, ergonomic fetch for JS/TS
  tagline: JSON helpers, caching, middleware, rate limiting, circuit breaker, and great DX
  image:
    src: https://raw.githubusercontent.com/FoundatioFx/Foundatio/main/media/foundatio-icon.png
    alt: Foundatio
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/FoundatioFx/FetchClient
features:
  - icon: ⚡
    title: Typed JSON Helpers
    details: getJSON, postJSON, putJSON, patchJSON, deleteJSON with full TypeScript support.
  - icon: 🎯
    title: Two API Styles
    details: Use simple functions or classes - your choice. Both have full access to all features.
  - icon: 💾
    title: Response Caching
    details: TTL-based caching with cache keys and tags for grouped invalidation.
  - icon: 🧩
    title: Middleware
    details: Intercept requests and responses for logging, auth, transforms, and more.
  - icon: 🚦
    title: Rate Limiting
    details: Per-domain rate limits with automatic API header detection.
  - icon: 🛡️
    title: Circuit Breaker
    details: Prevent cascading failures when services go down.
  - icon: ⏱️
    title: Timeouts & Cancellation
    details: Request timeouts with native AbortSignal support.
  - icon: 🧪
    title: Testing Built-in
    details: MockRegistry for mocking HTTP requests without network calls.
---

## Quick Example

FetchClient works two ways - pick whichever style you prefer:

### Functional API

```ts
import { getJSON, postJSON, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const { data: users } = await getJSON<User[]>("/users");
const { data: created } = await postJSON<User>("/users", { name: "Alice" });
```

Or use `getFetchClient()` for fewer imports:

```ts
import { getFetchClient, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const client = getFetchClient();
const { data: users } = await client.getJSON<User[]>("/users");
const { data: created } = await client.postJSON<User>("/users", {
  name: "Alice",
});
```

### Class-Based API

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient({ baseUrl: "https://api.example.com" });
const { data } = await client.getJSON<User[]>("/users");
```

## Caching

```ts
const { data } = await getJSON<User>("/api/users/1", {
  cacheKey: ["users", "1"],
  cacheDuration: 60000,
  cacheTags: ["users"],
});

// Invalidate all user cache entries
getCache().deleteByTag("users");
```

## Middleware

```ts
import { useMiddleware } from "@foundatiofx/fetchclient";

useMiddleware(async (ctx, next) => {
  console.log("Request:", ctx.request.url);
  await next();
  console.log("Response:", ctx.response?.status);
});
```

## Rate Limiting & Circuit Breaker

```ts
import {
  useCircuitBreaker,
  usePerDomainRateLimit,
} from "@foundatiofx/fetchclient";

// Prevent overwhelming APIs
usePerDomainRateLimit({ maxRequests: 100, windowSeconds: 60 });

// Stop requests when services fail
useCircuitBreaker({ failureThreshold: 5, openDurationMs: 30000 });
```

## Testing

```ts
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

const mocks = new MockRegistry();
mocks.onGet("/api/users").reply(200, [{ id: 1, name: "Alice" }]);
mocks.install(provider);

// Requests are mocked - no network calls
const { data } = await getJSON("/api/users");
```
