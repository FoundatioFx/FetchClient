# Configuration

FetchClient uses a **default provider** behind the scenes that manages shared configuration, cache, and state for your entire app. You don't need to create or manage providers directly - just call the configuration functions and everything works.

## How It Works

When you use `new FetchClient()` or call functions like `getJSON()`, they all share the same default provider. This means:

- **Shared configuration** - Set `baseUrl` once, use it everywhere
- **Shared cache** - Cache entries are available to all clients
- **Shared middleware** - Add logging once, it applies to all requests
- **Shared state** - Track loading state across your entire app

```ts
import { FetchClient, getJSON, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

// Both use the same configuration and cache
const client = new FetchClient();
await client.getJSON("/users");  // Uses baseUrl
await getJSON("/users");         // Same baseUrl, same cache
```

## Basic Setup

Configure your app once at startup:

```ts
// app-init.ts
import {
  setAccessTokenFunc,
  setBaseUrl,
  useMiddleware,
} from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

setAccessTokenFunc(() => localStorage.getItem("token"));

useMiddleware(async (ctx, next) => {
  console.log(`→ ${ctx.request.method} ${ctx.request.url}`);
  await next();
  console.log(`← ${ctx.response?.status}`);
});
```

Then use the API anywhere:

```ts
// anywhere.ts
import { getJSON, postJSON } from "@foundatiofx/fetchclient";

const { data: users } = await getJSON<User[]>("/users");
const { data: created } = await postJSON<User>("/users", { name: "Alice" });
```

## Configuration Options

### Base URL

```ts
import { setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

// Now all requests use this base URL
await getJSON("/users"); // https://api.example.com/users
```

### Authentication

```ts
import { setAccessTokenFunc } from "@foundatiofx/fetchclient";

setAccessTokenFunc(() => localStorage.getItem("token"));

// All requests automatically include Authorization: Bearer <token>
```

### Middleware

```ts
import { useMiddleware } from "@foundatiofx/fetchclient";

// Logging
useMiddleware(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.request.url}: ${Date.now() - start}ms`);
});

// Error tracking
useMiddleware(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    errorTracker.capture(error);
    throw error;
  }
});
```

### Rate Limiting

```ts
import { usePerDomainRateLimit, useRateLimit } from "@foundatiofx/fetchclient";

// Global rate limit
useRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});

// Or per-domain (each domain gets its own limit)
usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});
```

### Circuit Breaker

```ts
import {
  useCircuitBreaker,
  usePerDomainCircuitBreaker,
} from "@foundatiofx/fetchclient";

// Global circuit breaker
useCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});

// Or per-domain (each domain gets its own circuit)
usePerDomainCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});
```

### Model Validation

Validate request data before sending:

```ts
import { ProblemDetails, setModelValidator } from "@foundatiofx/fetchclient";

setModelValidator(async (data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const problem = new ProblemDetails();
    problem.errors = formatErrors(result.error);
    return problem;
  }
  return null;
});
```

## Shared Cache

All FetchClient instances share the same cache. Use `getCache()` to access it:

```ts
import { getCache } from "@foundatiofx/fetchclient";

// Invalidate specific entries
getCache().delete(["users", "1"]);

// Invalidate by tag
getCache().deleteByTag("users");

// Clear all cache
getCache().clear();
```

## Loading State

Track loading state across all requests:

```ts
import { getCurrentProvider } from "@foundatiofx/fetchclient";

const provider = getCurrentProvider();

// Check if any request is in progress
console.log(provider.isLoading);
console.log(provider.requestCount);

// Subscribe to loading state changes
provider.loading.on((isLoading) => {
  if (isLoading) {
    showSpinner();
  } else {
    hideSpinner();
  }
});
```

## Complete Example

```ts
// app-init.ts
import {
  getCache,
  getCurrentProvider,
  setAccessTokenFunc,
  setBaseUrl,
  useCircuitBreaker,
  useMiddleware,
  usePerDomainRateLimit,
} from "@foundatiofx/fetchclient";

// Base configuration
setBaseUrl("https://api.example.com");
setAccessTokenFunc(() => localStorage.getItem("token"));

// Logging middleware
useMiddleware(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(
    `${ctx.request.url}: ${ctx.response?.status} (${Date.now() - start}ms)`,
  );
});

// Resilience
usePerDomainRateLimit({ maxRequests: 100, windowSeconds: 60 });
useCircuitBreaker({ failureThreshold: 5, openDurationMs: 30000 });

// Loading indicator
getCurrentProvider().loading.on((isLoading) => {
  document.body.classList.toggle("loading", isLoading);
});
```

```ts
// user-service.ts
import { deleteJSON, getCache, getJSON, postJSON } from "@foundatiofx/fetchclient";

export async function getUsers() {
  const { data } = await getJSON<User[]>("/users", {
    cacheKey: ["users"],
    cacheDuration: 60000,
    cacheTags: ["users"],
  });
  return data;
}

export async function createUser(name: string) {
  const { data } = await postJSON<User>("/users", { name });
  getCache().deleteByTag("users"); // Invalidate user cache
  return data;
}

export async function deleteUser(id: number) {
  await deleteJSON(`/users/${id}`);
  getCache().deleteByTag("users");
}
```

## Advanced: Custom Providers

For advanced use cases like connecting to multiple APIs with different configurations, you can create separate `FetchClientProvider` instances. See the [API reference](https://jsr.io/@foundatiofx/fetchclient/doc/~/FetchClientProvider) for details.
