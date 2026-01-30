# FetchClientProvider

The `FetchClientProvider` is a central configuration point for creating `FetchClient` instances with shared settings. It manages common configuration like base URLs, middleware, caching, rate limiting, and circuit breakers.

## Why Use a Provider?

Without a provider, you'd need to configure each client individually:

```ts
// Without provider - repetitive configuration
const client1 = new FetchClient({
  baseUrl: "https://api.example.com",
  middleware: [loggingMiddleware, authMiddleware],
});

const client2 = new FetchClient({
  baseUrl: "https://api.example.com",
  middleware: [loggingMiddleware, authMiddleware],
});
```

With a provider, configure once and create many clients:

```ts
// With provider - configure once
const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");
provider.useMiddleware(loggingMiddleware);
provider.useMiddleware(authMiddleware);

const client1 = provider.getFetchClient();
const client2 = provider.getFetchClient();
// Both clients share the same configuration
```

## Creating a Provider

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
```

### Custom Fetch Function

Pass a custom fetch function for testing or special environments:

```ts
const provider = new FetchClientProvider(customFetch);

// Or set it later
provider.fetch = customFetch;
```

## Configuration

### Base URL

Set a base URL for all requests:

```ts
provider.setBaseUrl("https://api.example.com");

const client = provider.getFetchClient();
await client.getJSON("/users"); // https://api.example.com/users
```

### Authentication

Set an access token function:

```ts
provider.setAccessTokenFunc(() => {
  return localStorage.getItem("token");
});

// All clients will include Authorization header automatically
```

### Middleware

Add middleware that applies to all clients:

```ts
// Logging middleware
provider.useMiddleware(async (ctx, next) => {
  console.log(`→ ${ctx.request.method} ${ctx.request.url}`);
  await next();
  console.log(`← ${ctx.response?.status}`);
});

// Error tracking middleware
provider.useMiddleware(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    errorTracker.capture(error);
    throw error;
  }
});
```

### Rate Limiting

Enable rate limiting:

```ts
// Global rate limit
provider.useRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});

// Or per-domain rate limiting
provider.usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});

// Access the rate limiter
const limiter = provider.rateLimiter;

// Remove rate limiting
provider.removeRateLimit();
```

### Circuit Breaker

Enable circuit breaker:

```ts
// Global circuit breaker
provider.useCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});

// Or per-domain circuit breaker
provider.usePerDomainCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});

// Access the circuit breaker
const breaker = provider.circuitBreaker;

// Remove circuit breaker
provider.removeCircuitBreaker();
```

### Model Validation

Set a validator for request data:

```ts
provider.setModelValidator(async (data) => {
  // Validate with Zod, Yup, etc.
  const result = schema.safeParse(data);
  if (!result.success) {
    const problem = new ProblemDetails();
    problem.errors = formatErrors(result.error);
    return problem;
  }
  return null;
});
```

## Creating Clients

### Basic Client

```ts
const client = provider.getFetchClient();
```

### Client with Additional Options

Pass options to override or extend provider settings:

```ts
const client = provider.getFetchClient({
  // Add client-specific middleware
  middleware: [clientSpecificMiddleware],
});
```

## Shared Resources

All clients from the same provider share:

### Cache

```ts
const client1 = provider.getFetchClient();
const client2 = provider.getFetchClient();

// Both use the same cache
console.log(client1.cache === client2.cache); // true
console.log(client1.cache === provider.cache); // true

// Cache entry from client1 is available to client2
await client1.getJSON("/api/data", { cacheKey: ["data"], cacheDuration: 60000 });
await client2.getJSON("/api/data", { cacheKey: ["data"], cacheDuration: 60000 });
// Second call uses cached data
```

### Loading State

Track loading state across all clients:

```ts
// Check if any request is in progress
console.log(provider.isLoading);

// Get the number of ongoing requests
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

## Default Provider

FetchClient includes a **default global provider** that's shared across your entire application. This means you don't need to create providers or call `getFetchClient()` throughout your app - just configure the default provider once and use the functional API everywhere.

### Simple App Setup

For most applications, configure the default provider at startup and use the functional API:

```ts
// app-init.ts - Configure once at startup
import {
  setBaseUrl,
  setAccessTokenFunc,
  useMiddleware,
  useRateLimit,
} from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");
setAccessTokenFunc(() => localStorage.getItem("token"));
useMiddleware(loggingMiddleware);
useRateLimit({ maxRequests: 100, windowSeconds: 60 });
```

```ts
// anywhere-in-your-app.ts - Use the functional API
import { getJSON, postJSON } from "@foundatiofx/fetchclient";

// These automatically use the default provider's configuration
const { data: users } = await getJSON<User[]>("/users");
const { data: created } = await postJSON<User>("/users", { name: "Alice" });
```

### When to Use FetchClient Directly

You only need to use `new FetchClient()` or `provider.getFetchClient()` when you want:

- **Instance-specific middleware** via `client.use()`
- **Different configurations** for different parts of your app
- **Explicit control** over which provider a client uses

```ts
// Most apps don't need this - just use getJSON/postJSON directly
const client = new FetchClient();

// Only use this pattern when you need client-specific middleware
const client = new FetchClient();
client.use(specialMiddlewareForThisClient);
```

### Accessing the Default Provider

```ts
import { getCurrentProvider } from "@foundatiofx/fetchclient";

// Get the default provider instance
const provider = getCurrentProvider();

// Access shared resources
console.log(provider.isLoading);
console.log(provider.cache);
console.log(provider.rateLimiter);
```

### When to Create Your Own Provider

Create a custom provider when you need:

- **Multiple API configurations** (e.g., different base URLs for different services)
- **Isolated caching** between different parts of your app
- **Framework integration** with scoped state (React context, Vue provide/inject)

```ts
// Multiple providers for different APIs
const mainApi = new FetchClientProvider();
mainApi.setBaseUrl("https://api.example.com");

const analyticsApi = new FetchClientProvider();
analyticsApi.setBaseUrl("https://analytics.example.com");

// Each has its own cache, rate limits, etc.
```

### Custom Provider Function

For frameworks with scoped state (React, Vue, etc.), set a custom provider function:

```ts
import { setCurrentProviderFunc } from "@foundatiofx/fetchclient";

// React example with context
setCurrentProviderFunc(() => {
  return useContext(FetchClientContext);
});
```

This allows the functional API (`getJSON`, `postJSON`, etc.) to use different providers in different parts of your component tree.

## Complete Example

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

// Create and configure provider
const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");

// Authentication
provider.setAccessTokenFunc(() => localStorage.getItem("token"));

// Logging
provider.useMiddleware(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.request.url}: ${ctx.response?.status} (${Date.now() - start}ms)`);
});

// Resilience
provider.usePerDomainRateLimit({ maxRequests: 100, windowSeconds: 60 });
provider.usePerDomainCircuitBreaker({ failureThreshold: 5 });

// Loading indicator
provider.loading.on((isLoading) => {
  document.body.classList.toggle("loading", isLoading);
});

// Create clients
const client = provider.getFetchClient();

// Use the client
const { data } = await client.getJSON<User[]>("/users");
```

## Provider vs Client Options

| Setting | Provider | Client |
| ------- | -------- | ------ |
| Base URL | `setBaseUrl()` | `baseUrl` option |
| Middleware | `useMiddleware()` | `middleware` option |
| Access token | `setAccessTokenFunc()` | `accessTokenFunc` option |
| Rate limiting | `useRateLimit()` | Not available |
| Circuit breaker | `useCircuitBreaker()` | Not available |
| Cache | Shared automatically | Shared from provider |

Client options are merged with provider options, with client options taking precedence for conflicts.
