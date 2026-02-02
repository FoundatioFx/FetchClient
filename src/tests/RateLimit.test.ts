import { assertEquals, assertRejects } from "@std/assert";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import {
  RateLimitError,
  type RateLimitMiddlewareOptions,
} from "../RateLimitMiddleware.ts";
import type { FetchClientResponse } from "../FetchClientResponse.ts";
import {
  buildRateLimitHeader,
  buildRateLimitPolicyHeader,
  parseRateLimitHeader,
  parseRateLimitPolicyHeader,
  RateLimiter,
} from "../RateLimiter.ts";

// Mock fetch function for testing
const createMockFetch = (response: {
  status?: number;
  statusText?: string;
  body?: string;
  headers?: Record<string, string>;
} = {}) => {
  return (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(response.headers || {});
    headers.set("Content-Type", "application/json");

    return Promise.resolve(
      new Response(response.body || JSON.stringify({ success: true }), {
        status: response.status || 200,
        statusText: response.statusText || "OK",
        headers,
      }),
    );
  };
};

Deno.test("RateLimiter - basic functionality", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 2,
    windowSeconds: 1,
  });

  // First request should be allowed
  assertEquals(rateLimiter.isAllowed("http://example.com"), true);
  assertEquals(rateLimiter.getRequestCount("http://example.com"), 1);
  assertEquals(
    rateLimiter.getRemainingRequests("http://example.com"),
    1,
  );

  // Second request should be allowed
  assertEquals(rateLimiter.isAllowed("http://example.com"), true);
  assertEquals(rateLimiter.getRequestCount("http://example.com"), 2);
  assertEquals(
    rateLimiter.getRemainingRequests("http://example.com"),
    0,
  );

  // Third request should be denied
  assertEquals(rateLimiter.isAllowed("http://example.com"), false);
  assertEquals(rateLimiter.getRequestCount("http://example.com"), 2);
  assertEquals(
    rateLimiter.getRemainingRequests("http://example.com"),
    0,
  );
});

Deno.test("RateLimiter - group generator", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 1,
    windowSeconds: 1,
    getGroupFunc: (url: string) => `${url}`,
  });

  // Different URLs should have separate buckets
  assertEquals(rateLimiter.isAllowed("http://example.com"), true);
  assertEquals(rateLimiter.isAllowed("http://other.com"), true);
  assertEquals(rateLimiter.isAllowed("http://example.com"), false);
  assertEquals(rateLimiter.isAllowed("http://other.com"), false);
});

Deno.test("RateLimiter - group initialization", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 5,
    windowSeconds: 1,
    getGroupFunc: (url: string) => new URL(url).hostname,
    groups: {
      "example.com": {
        maxRequests: 2,
        windowSeconds: 1,
      },
      "api.example.com": {
        maxRequests: 10,
        windowSeconds: 2,
      },
    },
  });

  // Check that group options were applied correctly
  const exampleOptions = rateLimiter.getGroupOptions("example.com");
  assertEquals(exampleOptions.maxRequests, 2);
  assertEquals(exampleOptions.windowSeconds, 1);

  const apiOptions = rateLimiter.getGroupOptions("api.example.com");
  assertEquals(apiOptions.maxRequests, 10);
  assertEquals(apiOptions.windowSeconds, 2);

  // Check that non-configured groups get empty options (will use defaults)
  const otherOptions = rateLimiter.getGroupOptions("other.com");
  assertEquals(otherOptions.maxRequests, 5);
  assertEquals(otherOptions.windowSeconds, 1);

  // Test that the group-specific limits are actually used
  assertEquals(rateLimiter.isAllowed("https://example.com/test"), true);
  assertEquals(rateLimiter.isAllowed("https://example.com/test"), true);
  assertEquals(rateLimiter.isAllowed("https://example.com/test"), false); // Should be denied (limit=2)

  // API subdomain should have different limits
  assertEquals(
    rateLimiter.getRemainingRequests("https://api.example.com/test"),
    10,
  );
});

Deno.test("RateLimiter - time window expiry", async () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 1,
    windowSeconds: 0.1,
  });

  // First request should be allowed
  assertEquals(rateLimiter.isAllowed("http://example.com"), true);

  // Second request should be denied
  assertEquals(rateLimiter.isAllowed("http://example.com"), false);

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Request should be allowed again
  assertEquals(rateLimiter.isAllowed("http://example.com"), true);
});

Deno.test("RateLimitMiddleware - throws error when rate limit exceeded", async () => {
  const mockFetch = createMockFetch();
  const provider = new FetchClientProvider(mockFetch);

  const options: RateLimitMiddlewareOptions = {
    maxRequests: 1,
    windowSeconds: 1,
    throwOnRateLimit: true,
  };

  provider.useRateLimit(options);

  const client = provider.getFetchClient();

  // First request should succeed
  const response1 = await client.get("http://example.com");
  assertEquals(response1.status, 200);

  // Second request should throw RateLimitError
  await assertRejects(
    () => client.get("http://example.com"),
    RateLimitError,
    "Rate limit exceeded",
  );
});

Deno.test("RateLimitMiddleware - returns 429 response when configured", async () => {
  const mockFetch = createMockFetch();
  const provider = new FetchClientProvider(mockFetch);

  const options: RateLimitMiddlewareOptions = {
    maxRequests: 1,
    windowSeconds: 1,
    throwOnRateLimit: false,
    errorMessage: "Custom rate limit message",
  };

  provider.useRateLimit(options);

  const client = provider.getFetchClient();

  // First request should succeed
  const response1 = await client.get("http://example.com");
  assertEquals(response1.status, 200);

  // Second request should throw 429 response
  try {
    await client.get("http://example.com");
    throw new Error("Expected rate limit response to be thrown");
  } catch (error) {
    // FetchClient throws FetchClientError for 4xx/5xx status codes
    const response = (error as { response: FetchClientResponse<unknown> })
      .response;
    assertEquals(response.status, 429);
    assertEquals(response.problem?.title, "Unexpected status code: 429");
    if (response.problem?.detail) {
      assertEquals(
        response.problem.detail.includes("Custom rate limit message"),
        true,
      );
    }
  }
});

Deno.test("RateLimitMiddleware - provides rate limit info in error response", async () => {
  const mockFetch = createMockFetch();
  const provider = new FetchClientProvider(mockFetch);

  const options: RateLimitMiddlewareOptions = {
    maxRequests: 1,
    windowSeconds: 1,
    throwOnRateLimit: false,
  };

  provider.useRateLimit(options);

  const client = provider.getFetchClient();

  // First request should succeed
  const response1 = await client.get("http://example.com");
  assertEquals(response1.status, 200);

  // Second request should throw 429 with rate limit headers
  try {
    await client.get("http://example.com");
    throw new Error("Expected rate limit response to be thrown");
  } catch (error) {
    const response = (error as { response: FetchClientResponse<unknown> })
      .response;
    assertEquals(response.status, 429);
    assertEquals(response.headers.get("RateLimit-Limit"), "1");
    assertEquals(response.headers.get("RateLimit-Remaining"), "0");
    assertEquals(response.headers.get("RateLimit-Reset") !== null, true);
    assertEquals(response.headers.get("Retry-After") !== null, true);
  }
});

Deno.test("createRateLimitMiddleware - custom group generator", async () => {
  const mockFetch = createMockFetch();
  const provider = new FetchClientProvider(mockFetch);

  let callCount = 0;
  const options: RateLimitMiddlewareOptions = {
    maxRequests: 1,
    windowSeconds: 1,
    getGroupFunc: (url: string) => {
      callCount++;
      return `custom-${url}`;
    },
    throwOnRateLimit: true,
    autoUpdateFromHeaders: false, // Disable auto-update to prevent extra getGroupFunc calls
  };

  provider.useRateLimit(options);

  const client = provider.getFetchClient();

  // First request should succeed and call key generator
  await client.get("http://example.com");
  assertEquals(callCount, 1);

  // Second request should call key generator and throw
  await assertRejects(
    () => client.get("http://example.com"),
    RateLimitError,
  );
  // The key generator might be called multiple times due to the rate limiting logic
  assertEquals(callCount >= 2, true);
});

Deno.test("RateLimitError - contains correct information", async () => {
  const mockFetch = createMockFetch();
  const provider = new FetchClientProvider(mockFetch);

  provider.useRateLimit({
    maxRequests: 1,
    windowSeconds: 1,
    throwOnRateLimit: true,
  });

  const client = provider.getFetchClient();

  // First request should succeed
  await client.get("http://example.com");

  // Second request should throw with proper error info
  try {
    await client.get("http://example.com");
    throw new Error("Expected request to fail");
  } catch (error) {
    if (error instanceof RateLimitError) {
      assertEquals(error.name, "RateLimitError");
      assertEquals(error.remainingRequests, 0);
      assertEquals(typeof error.resetTime, "number");
      assertEquals(error.resetTime > Date.now(), true);
    } else {
      throw new Error("Expected RateLimitError");
    }
  }
});

Deno.test("RateLimiter - updateFromHeaders with standard headers", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with IETF standard headers
  const headers = new Headers({
    "ratelimit-policy": '"default";q=100;w=60',
    "ratelimit": '"default";r=75;t=30',
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  assertEquals(groupOptions.maxRequests, 100);
  assertEquals(groupOptions.windowSeconds, 60);
});

Deno.test("RateLimiter - updateFromHeaders with x-ratelimit fallback headers", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with fallback x-ratelimit headers
  const headers = new Headers({
    "x-ratelimit-limit": "50",
    "x-ratelimit-remaining": "25",
    "x-ratelimit-reset": "1234567890",
    "x-ratelimit-window": "120",
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  assertEquals(groupOptions.maxRequests, 50);
  assertEquals(groupOptions.windowSeconds, 120);
});

Deno.test("RateLimiter - updateFromHeaders with x-rate-limit fallback headers", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with alternate x-rate-limit headers
  const headers = new Headers({
    "x-rate-limit-limit": "200",
    "x-rate-limit-remaining": "150",
    "x-rate-limit-reset": "1234567890",
    "x-rate-limit-window": "30",
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  assertEquals(groupOptions.maxRequests, 200);
  assertEquals(groupOptions.windowSeconds, 30);
});

Deno.test("RateLimiter - updateFromHeaders prioritizes standard over x-ratelimit", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with both IETF and x-ratelimit headers - IETF should take precedence
  const headers = new Headers({
    "ratelimit-policy": '"default";q=100;w=60',
    "ratelimit": '"default";r=75;t=30',
    "x-ratelimit-limit": "50",
    "x-ratelimit-remaining": "25",
    "x-ratelimit-reset": "1234567890",
    "x-ratelimit-window": "120",
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  // Should use IETF standard values (100 limit, 60 window), not x-ratelimit values
  assertEquals(groupOptions.maxRequests, 100);
  assertEquals(groupOptions.windowSeconds, 60);
});

Deno.test("RateLimiter - updateFromHeaders with reset time calculation", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with only reset time (no window)
  const futureTime = Math.floor(Date.now() / 1000) + 90; // 90 seconds in the future
  const headers = new Headers({
    "x-ratelimit-limit": "50",
    "x-ratelimit-reset": futureTime.toString(),
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  assertEquals(groupOptions.maxRequests, 50);
  // Window should be approximately 90 seconds
  assertEquals(groupOptions.windowSeconds! >= 85, true);
  assertEquals(groupOptions.windowSeconds! <= 95, true);
});

Deno.test("RateLimiter - updateFromHeaders with malformed IETF headers", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with malformed IETF headers should fall back to x-ratelimit
  const headers = new Headers({
    "ratelimit-policy": '"default";invalid=format',
    "ratelimit": '"default";bad=format',
    "x-ratelimit-limit": "50",
    "x-ratelimit-window": "120",
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  assertEquals(groupOptions.maxRequests, 50);
  assertEquals(groupOptions.windowSeconds, 120);
});

Deno.test("createRateLimitHeader - creates correct header format", () => {
  const result = buildRateLimitHeader({
    policy: "default",
    remaining: 75,
    resetSeconds: 30,
  });

  assertEquals(result, '"default";r=75;t=30');
});

Deno.test("createRateLimitHeader - handles missing reset time", () => {
  const result = buildRateLimitHeader({
    policy: "default",
    remaining: 75,
    resetSeconds: 0,
  });

  assertEquals(result, '"default";r=75');
});

Deno.test("createRateLimitPolicyHeader - creates correct header format", () => {
  const result = buildRateLimitPolicyHeader({
    policy: "default",
    limit: 100,
    windowSeconds: 60,
  });

  assertEquals(result, '"default";q=100;w=60');
});

Deno.test("createRateLimitPolicyHeader - handles missing window", () => {
  const result = buildRateLimitPolicyHeader({
    policy: "default",
    limit: 100,
  });

  assertEquals(result, '"default";q=100');
});

Deno.test("parseRateLimitHeader - parses correct header format", () => {
  const result = parseRateLimitHeader('"default";r=75;t=30');

  assertEquals(result, {
    policy: "default",
    remaining: 75,
    resetSeconds: 30,
  });
});

Deno.test("parseRateLimitHeader - handles missing parameters", () => {
  const result = parseRateLimitHeader('"default";r=75');

  assertEquals(result, {
    policy: "default",
    remaining: 75,
  });
});

Deno.test("parseRateLimitHeader - handles invalid format", () => {
  const result = parseRateLimitHeader("invalid-format");

  assertEquals(result, {});
});

Deno.test("parseRateLimitPolicyHeader - parses correct header format", () => {
  const result = parseRateLimitPolicyHeader('"default";q=100;w=60');

  assertEquals(result, {
    policy: "default",
    limit: 100,
    windowSeconds: 60,
  });
});

Deno.test("parseRateLimitPolicyHeader - handles missing parameters", () => {
  const result = parseRateLimitPolicyHeader('"default";q=100');

  assertEquals(result, {
    policy: "default",
    limit: 100,
  });
});

Deno.test("parseRateLimitPolicyHeader - handles invalid format", () => {
  const result = parseRateLimitPolicyHeader("invalid-format");

  assertEquals(result, {});
});
