# Rate Limiting

FetchClient includes built-in rate limiting to prevent overwhelming APIs and respect rate limits.

## Basic Rate Limiting

Enable rate limiting globally:

```ts
import { FetchClient, useRateLimit } from "@foundatiofx/fetchclient";

useRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});

const client = new FetchClient();

// All requests are now rate limited to 100 per minute
for (let i = 0; i < 150; i++) {
  try {
    await client.getJSON("/api/data");
  } catch (error) {
    // After 100 requests, throws RateLimitError
    console.log("Rate limited!");
  }
}
```

## Per-Domain Rate Limiting

Different APIs have different rate limits. Use per-domain rate limiting to track each domain separately:

```ts
import { usePerDomainRateLimit } from "@foundatiofx/fetchclient";

usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});

// Each domain gets its own rate limit counter
await client.getJSON("https://api1.example.com/data"); // Counter: api1 = 1
await client.getJSON("https://api2.example.com/data"); // Counter: api2 = 1
await client.getJSON("https://api1.example.com/users"); // Counter: api1 = 2
```

## Provider-Level Configuration

Configure rate limiting on a specific provider:

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();

provider.useRateLimit({
  maxRequests: 50,
  windowSeconds: 30,
});

// Or per-domain
provider.usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});
```

## Handling Rate Limits

### Throwing Errors (Default)

By default, exceeding the rate limit throws a `RateLimitError`:

```ts
import { RateLimitError } from "@foundatiofx/fetchclient";

try {
  await client.getJSON("/api/data");
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited! Retry after ${error.retryAfter}ms`);
    console.log(`Group: ${error.group}`);
  }
}
```

### Returning 429 Response

Configure to return a 429 response instead of throwing:

```ts
provider.useRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
  throwOnLimit: false, // Return 429 response instead
});

const response = await client.getJSON("/api/data");
if (response.status === 429) {
  const retryAfter = response.response?.headers.get("Retry-After");
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
}
```

## Reading Rate Limit Headers

FetchClient can automatically update rate limits from server response headers. This respects the API's actual limits:

```ts
const provider = new FetchClientProvider();

provider.usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
  updateFromHeaders: true, // Read limits from response headers
});
```

Supported header formats:

```http
# Standard IETF format (draft-ietf-httpapi-ratelimit-headers)
RateLimit: limit=100, remaining=95, reset=30

# Common alternatives
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000

# GitHub-style
X-Rate-Limit-Limit: 100
X-Rate-Limit-Remaining: 95
X-Rate-Limit-Reset: 1640000000
```

## Accessing the Rate Limiter

Access the underlying rate limiter for manual control:

```ts
const limiter = provider.rateLimiter;

if (limiter) {
  // Check if a request is allowed
  const allowed = limiter.isAllowed("https://api.example.com");

  // Get current state
  const remaining = limiter.getRemaining("https://api.example.com");
  const resetTime = limiter.getResetTime("https://api.example.com");

  // Manually record a request
  limiter.recordRequest("https://api.example.com");
}
```

## Removing Rate Limiting

```ts
provider.removeRateLimit();
```

## Custom Grouping

Group requests by custom logic instead of domain:

```ts
import {
  FetchClientProvider,
  RateLimitMiddleware
} from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();

const middleware = new RateLimitMiddleware({
  maxRequests: 100,
  windowSeconds: 60,
  getGroupFunc: (url) => {
    // Group by API version
    if (url.includes("/v1/")) return "v1";
    if (url.includes("/v2/")) return "v2";
    return "default";
  },
});

provider.useMiddleware(middleware.middleware());
```

## Practical Example: API Client with Backoff

```ts
import {
  FetchClient,
  FetchClientProvider,
  RateLimitError
} from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");
provider.usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
  updateFromHeaders: true,
});

const client = provider.getFetchClient();

async function fetchWithRetry<T>(
  url: string,
  maxRetries = 3
): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.getJSON<T>(url);
      return response.data;
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.log(`Rate limited. Waiting ${error.retryAfter}ms...`);
        await new Promise(r => setTimeout(r, error.retryAfter));
        continue;
      }
      throw error;
    }
  }
  return null;
}
```
