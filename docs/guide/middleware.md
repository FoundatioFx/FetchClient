# Middleware

Middleware lets you intercept and modify requests and responses. Use it for logging, authentication, error handling, data transformation, and more.

## How Middleware Works

Middleware functions receive a context object and a `next` function. Call `next()` to continue to the next middleware (or the actual fetch). Code before `next()` runs before the request; code after runs after the response.

```ts
async function myMiddleware(ctx, next) {
  // Before request
  console.log("Starting:", ctx.request.url);

  await next(); // Execute request

  // After response
  console.log("Completed:", ctx.response?.status);
}
```

## Adding Middleware

### Global Middleware

Applies to all `FetchClient` instances:

```ts
import { useMiddleware } from "@foundatiofx/fetchclient";

useMiddleware(async (ctx, next) => {
  console.log("Request:", ctx.request.url);
  await next();
  console.log("Response:", ctx.response?.status);
});
```

### Provider Middleware

Applies to clients from a specific provider:

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();

provider.useMiddleware(async (ctx, next) => {
  // Add custom header
  ctx.request.headers.set("X-Custom-Header", "value");
  await next();
});

const client = provider.getFetchClient();
```

### Client Middleware

Applies to a single client:

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient({
  middleware: [
    async (ctx, next) => {
      console.log("Client-specific middleware");
      await next();
    },
  ],
});
```

## Middleware Context

The context object provides access to the request and response:

```ts
interface FetchClientContext {
  request: Request;           // The outgoing request
  response?: Response;        // The response (after next())
  data?: unknown;             // Parsed response data (JSON)
  options: RequestOptions;    // Request options
}
```

## Common Middleware Patterns

### Logging

```ts
provider.useMiddleware(async (ctx, next) => {
  const start = Date.now();
  console.log(`→ ${ctx.request.method} ${ctx.request.url}`);

  await next();

  const duration = Date.now() - start;
  console.log(`← ${ctx.response?.status} (${duration}ms)`);
});
```

### Authentication

```ts
provider.useMiddleware(async (ctx, next) => {
  const token = localStorage.getItem("token");
  if (token) {
    ctx.request.headers.set("Authorization", `Bearer ${token}`);
  }
  await next();
});
```

Or use the built-in access token function:

```ts
import { setAccessTokenFunc } from "@foundatiofx/fetchclient";

setAccessTokenFunc(() => localStorage.getItem("token"));
```

### Request/Response Transformation

```ts
// Add timestamp to all POST requests
provider.useMiddleware(async (ctx, next) => {
  if (ctx.request.method === "POST") {
    const body = await ctx.request.json();
    body.timestamp = Date.now();
    ctx.request = new Request(ctx.request, {
      body: JSON.stringify(body),
    });
  }
  await next();
});
```

### Error Handling

```ts
provider.useMiddleware(async (ctx, next) => {
  await next();

  if (ctx.response && !ctx.response.ok) {
    // Log errors
    console.error(`API Error: ${ctx.response.status} ${ctx.request.url}`);

    // Could transform the response or add metadata
  }
});
```

### Retry Logic

```ts
provider.useMiddleware(async (ctx, next) => {
  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await next();

      // Success or client error - don't retry
      if (ctx.response && ctx.response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error as Error;
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  if (lastError) throw lastError;
});
```

### Response Validation with Zod

```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

provider.useMiddleware(async (ctx, next) => {
  await next();

  // Validate response data
  if (ctx.data && ctx.request.url.includes("/users/")) {
    const result = UserSchema.safeParse(ctx.data);
    if (!result.success) {
      console.error("Invalid user data:", result.error);
      // Optionally throw or modify response
    }
  }
});
```

### Analytics/Metrics

```ts
provider.useMiddleware(async (ctx, next) => {
  const start = performance.now();

  try {
    await next();
  } finally {
    const duration = performance.now() - start;

    // Send to analytics
    analytics.track("api_request", {
      url: ctx.request.url,
      method: ctx.request.method,
      status: ctx.response?.status,
      duration,
    });
  }
});
```

## Middleware Execution Order

Middleware executes in the order it's added:

```ts
provider.useMiddleware(async (ctx, next) => {
  console.log("1. First middleware - before");
  await next();
  console.log("6. First middleware - after");
});

provider.useMiddleware(async (ctx, next) => {
  console.log("2. Second middleware - before");
  await next();
  console.log("5. Second middleware - after");
});

provider.useMiddleware(async (ctx, next) => {
  console.log("3. Third middleware - before");
  await next();
  console.log("4. Third middleware - after");
});

// Output:
// 1. First middleware - before
// 2. Second middleware - before
// 3. Third middleware - before
// (fetch happens here)
// 4. Third middleware - after
// 5. Second middleware - after
// 6. First middleware - after
```

## Accessing Response Data

After `next()`, you can access the parsed response data:

```ts
provider.useMiddleware(async (ctx, next) => {
  await next();

  // ctx.data contains the parsed JSON response
  if (ctx.data) {
    console.log("Response data:", ctx.data);
  }

  // ctx.response is the raw Response object
  console.log("Status:", ctx.response?.status);
  console.log("Headers:", ctx.response?.headers);
});
```

## Short-Circuiting

You can return early without calling `next()` to skip the actual request:

```ts
provider.useMiddleware(async (ctx, next) => {
  // Return cached data for specific URLs
  if (ctx.request.url.includes("/static/")) {
    ctx.response = new Response(JSON.stringify({ cached: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    return; // Don't call next()
  }

  await next();
});
```

## Practical Example: Complete Setup

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");

// 1. Logging
provider.useMiddleware(async (ctx, next) => {
  const start = Date.now();
  console.log(`→ ${ctx.request.method} ${ctx.request.url}`);

  await next();

  console.log(`← ${ctx.response?.status} (${Date.now() - start}ms)`);
});

// 2. Authentication
provider.useMiddleware(async (ctx, next) => {
  const token = getAuthToken();
  if (token) {
    ctx.request.headers.set("Authorization", `Bearer ${token}`);
  }
  await next();

  // Handle 401
  if (ctx.response?.status === 401) {
    clearAuthToken();
    window.location.href = "/login";
  }
});

// 3. Error tracking
provider.useMiddleware(async (ctx, next) => {
  try {
    await next();

    if (ctx.response && ctx.response.status >= 500) {
      errorTracker.captureMessage(`API 5xx: ${ctx.request.url}`);
    }
  } catch (error) {
    errorTracker.captureException(error);
    throw error;
  }
});

// Rate limiting and circuit breaker
provider.usePerDomainRateLimit({ maxRequests: 100, windowSeconds: 60 });
provider.useCircuitBreaker({ failureThreshold: 5 });

const client = provider.getFetchClient();
```
