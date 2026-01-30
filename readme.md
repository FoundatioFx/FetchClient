![Foundatio](https://raw.githubusercontent.com/foundatiofx/foundatio/master/media/foundatio-dark-bg.svg#gh-dark-mode-only "Foundatio")
![Foundatio](https://raw.githubusercontent.com/foundatiofx/foundatio/master/media/foundatio.svg#gh-light-mode-only "Foundatio")

[![NPM](https://img.shields.io/npm/v/%40foundatiofx%2Ffetchclient)](https://www.npmjs.com/package/@foundatiofx/fetchclient)
[![JSR](https://jsr.io/badges/@foundatiofx/fetchclient)](https://jsr.io/@foundatiofx/fetchclient)
[![Build status](https://github.com/foundatiofx/foundatio/workflows/Build/badge.svg)](https://github.com/foundatiofx/foundatio/actions)
[![Discord](https://img.shields.io/discord/715744504891703319)](https://discord.gg/6HxgFCx)

FetchClient is a tiny, typed wrapper around `fetch` with JSON helpers, caching,
middleware, rate limiting, circuit breaker, timeouts, and friendly error
handling.

## Features

- **Typed JSON helpers** - `getJSON`, `postJSON`, `putJSON`, `patchJSON`,
  `deleteJSON`
- **Two API styles** - Functional or class-based - your choice
- **Response caching** - TTL-based caching with tags for grouped invalidation
- **Middleware** - Intercept requests/responses for logging, auth, transforms
- **Rate limiting** - Per-domain rate limits with automatic header detection
- **Circuit breaker** - Prevent cascading failures when services go down
- **Timeouts** - Request timeouts with AbortSignal support
- **Error handling** - RFC 7807 Problem Details support
- **Testing** - MockRegistry for mocking HTTP in tests

## Install

```bash
npm install @foundatiofx/fetchclient
```

## Quick Example

FetchClient works two ways - pick whichever style you prefer:

### Functional API

```ts
import { getJSON, postJSON, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const { data: users } = await getJSON<User[]>("/users");
const { data: created } = await postJSON<User>("/users", { name: "Alice" });
```

Or use `getFetchClient()` to avoid multiple imports:

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
const response = await client.getJSON<User>("/api/users/1", {
  cacheKey: ["users", "1"],
  cacheDuration: 60000, // 1 minute
  cacheTags: ["users"],
});

// Invalidate by tag
client.cache.deleteByTag("users");
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

## Rate Limiting

```ts
import { usePerDomainRateLimit } from "@foundatiofx/fetchclient";

usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
  updateFromHeaders: true, // Respect API rate limit headers
});
```

## Circuit Breaker

```ts
import { useCircuitBreaker } from "@foundatiofx/fetchclient";

useCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});

// When API fails repeatedly, circuit opens
// Requests return 503 immediately without hitting the API
```

## Testing

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";
import { MockRegistry } from "@foundatiofx/fetchclient/mocks";

const mocks = new MockRegistry();
mocks.onGet("/api/users").reply(200, [{ id: 1, name: "Alice" }]);

const client = new FetchClient();
mocks.install(client);

const { data } = await client.getJSON("/api/users");
// data = [{ id: 1, name: "Alice" }]
```

## Documentation

- Guide & Examples: <https://fetchclient.foundatio.dev>
  - [Getting Started](https://fetchclient.foundatio.dev/guide/getting-started)
  - [Caching](https://fetchclient.foundatio.dev/guide/caching)
  - [Middleware](https://fetchclient.foundatio.dev/guide/middleware)
  - [Rate Limiting](https://fetchclient.foundatio.dev/guide/rate-limiting)
  - [Circuit Breaker](https://fetchclient.foundatio.dev/guide/circuit-breaker)
  - [Error Handling](https://fetchclient.foundatio.dev/guide/error-handling)
  - [Testing](https://fetchclient.foundatio.dev/guide/testing)
- API Reference: <https://jsr.io/@foundatiofx/fetchclient/doc>

---

MIT © [Foundatio](https://exceptionless.com)
