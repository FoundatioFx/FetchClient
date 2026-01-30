# Getting Started

## Install

```bash
npm install @foundatiofx/fetchclient
```

## Quick Usage

FetchClient offers two styles: **functional** (no classes) and **class-based**. Choose whichever you prefer - both have full access to all features.

### Functional Style (Recommended)

Use simple functions - no `new` keyword, no classes:

```ts
import { getJSON, postJSON, setBaseUrl } from "@foundatiofx/fetchclient";

// Configure once at app startup
setBaseUrl("https://api.example.com");

// Use anywhere in your app
const { data: users } = await getJSON<User[]>("/users");
const { data: created } = await postJSON<User>("/users", { name: "Alice" });
```

Or use `getFetchClient()` to get a client instance (fewer imports when using multiple methods):

```ts
import { getFetchClient, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const client = getFetchClient();
const { data: users } = await client.getJSON<User[]>("/users");
const { data: created } = await client.postJSON<User>("/users", { name: "Alice" });
await client.deleteJSON("/users/1");
```

All the function exports:

```ts
import {
  // HTTP methods
  getJSON,
  postJSON,
  putJSON,
  patchJSON,
  deleteJSON,

  // Get a client instance (alternative to individual function imports)
  getFetchClient,

  // Configuration
  setBaseUrl,
  setAccessTokenFunc,
  useMiddleware,
  useRateLimit,
  usePerDomainRateLimit,
  useCircuitBreaker,
  usePerDomainCircuitBreaker,
  setModelValidator,
} from "@foundatiofx/fetchclient";
```

### Class-Based Style

If you prefer classes, use `FetchClient` directly:

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient({ baseUrl: "https://api.example.com" });

const { data: users } = await client.getJSON<User[]>("/users");
const { data: created } = await client.postJSON<User>("/users", { name: "Alice" });
```

### Under the Hood

All styles use the same [default provider](/guide/provider#default-provider). The functional API is just a convenient wrapper:

```ts
// These are all equivalent:
await getJSON("/users");
await getFetchClient().getJSON("/users");
await getCurrentProvider().getFetchClient().getJSON("/users");
```

## Adding Middleware

**Functional:**

```ts
import { getJSON, useMiddleware } from "@foundatiofx/fetchclient";

useMiddleware(async (ctx, next) => {
  console.log("→", ctx.request.url);
  await next();
  console.log("←", ctx.response?.status);
});

await getJSON("https://api.example.com/users");
```

**Class-based:**

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();
client.use(async (ctx, next) => {
  console.log("→", ctx.request.url);
  await next();
  console.log("←", ctx.response?.status);
});

await client.getJSON("https://api.example.com/users");
```

## Complete Setup Example

Here's a typical app configuration using the functional API:

```ts
// app-init.ts - Configure once
import {
  setBaseUrl,
  setAccessTokenFunc,
  useMiddleware,
  usePerDomainRateLimit,
  useCircuitBreaker,
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

// All configuration is automatically applied
const { data } = await getJSON<User[]>("/users");
```
