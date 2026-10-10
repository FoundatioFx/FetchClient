import { expect, test } from "vite-plus/test";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { RateLimitError, type RateLimitMiddlewareOptions } from "../src/RateLimitMiddleware.ts";
import type { FetchClientResponse } from "../src/FetchClientResponse.ts";
import {
  buildRateLimitHeader,
  buildRateLimitPolicyHeader,
  parseRateLimitHeader,
  parseRateLimitPolicyHeader,
  RateLimiter,
} from "../src/RateLimiter.ts";

// Mock fetch function for testing
const createMockFetch = (
  response: {
    status?: number;
    statusText?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
) => {
  return (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
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

test("RateLimiter - basic functionality", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 2,
    windowSeconds: 1,
  });

  // First request should be allowed
  expect(rateLimiter.isAllowed("http://example.com")).toBe(true);
  expect(rateLimiter.getRequestCount("http://example.com")).toBe(1);
  expect(rateLimiter.getRemainingRequests("http://example.com")).toBe(1);

  // Second request should be allowed
  expect(rateLimiter.isAllowed("http://example.com")).toBe(true);
  expect(rateLimiter.getRequestCount("http://example.com")).toBe(2);
  expect(rateLimiter.getRemainingRequests("http://example.com")).toBe(0);

  // Third request should be denied
  expect(rateLimiter.isAllowed("http://example.com")).toBe(false);
  expect(rateLimiter.getRequestCount("http://example.com")).toBe(2);
  expect(rateLimiter.getRemainingRequests("http://example.com")).toBe(0);
});

test("RateLimiter - group generator", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 1,
    windowSeconds: 1,
    getGroupFunc: (url: string) => `${url}`,
  });

  // Different URLs should have separate buckets
  expect(rateLimiter.isAllowed("http://example.com")).toBe(true);
  expect(rateLimiter.isAllowed("http://other.com")).toBe(true);
  expect(rateLimiter.isAllowed("http://example.com")).toBe(false);
  expect(rateLimiter.isAllowed("http://other.com")).toBe(false);
});

test("RateLimiter - group initialization", () => {
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
  expect(exampleOptions.maxRequests).toBe(2);
  expect(exampleOptions.windowSeconds).toBe(1);

  const apiOptions = rateLimiter.getGroupOptions("api.example.com");
  expect(apiOptions.maxRequests).toBe(10);
  expect(apiOptions.windowSeconds).toBe(2);

  // Check that non-configured groups get empty options (will use defaults)
  const otherOptions = rateLimiter.getGroupOptions("other.com");
  expect(otherOptions.maxRequests).toBe(5);
  expect(otherOptions.windowSeconds).toBe(1);

  // Test that the group-specific limits are actually used
  expect(rateLimiter.isAllowed("https://example.com/test")).toBe(true);
  expect(rateLimiter.isAllowed("https://example.com/test")).toBe(true);
  expect(rateLimiter.isAllowed("https://example.com/test")).toBe(false); // Should be denied (limit=2)

  // API subdomain should have different limits
  expect(rateLimiter.getRemainingRequests("https://api.example.com/test")).toBe(10);
});

test("RateLimiter - time window expiry", async () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 1,
    windowSeconds: 0.1,
  });

  // First request should be allowed
  expect(rateLimiter.isAllowed("http://example.com")).toBe(true);

  // Second request should be denied
  expect(rateLimiter.isAllowed("http://example.com")).toBe(false);

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Request should be allowed again
  expect(rateLimiter.isAllowed("http://example.com")).toBe(true);
});

test("RateLimitMiddleware - throws error when rate limit exceeded", async () => {
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
  expect(response1.status).toBe(200);

  // Second request should throw RateLimitError
  const request = client.get("http://example.com");
  await expect(request).rejects.toThrow(RateLimitError);
  await expect(request).rejects.toThrow("Rate limit exceeded");
});

test("RateLimitMiddleware - returns 429 response when configured", async () => {
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
  expect(response1.status).toBe(200);

  // Second request should throw 429 response
  try {
    await client.get("http://example.com");
    throw new Error("Expected rate limit response to be thrown");
  } catch (error) {
    // FetchClient throws FetchClientError for 4xx/5xx status codes
    const response = (error as { response: FetchClientResponse<unknown> }).response;
    expect(response.status).toBe(429);
    expect(response.problem?.title).toBe("Too Many Requests");
    if (response.problem?.detail) {
      expect(response.problem.detail.includes("Custom rate limit message")).toBe(true);
    }
  }
});

test("RateLimitMiddleware - provides rate limit info in error response", async () => {
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
  expect(response1.status).toBe(200);

  // Second request should throw 429 with rate limit headers
  try {
    await client.get("http://example.com");
    throw new Error("Expected rate limit response to be thrown");
  } catch (error) {
    const response = (error as { response: FetchClientResponse<unknown> }).response;
    expect(response.status).toBe(429);
    expect(response.headers.get("RateLimit-Limit")).toBe("1");
    expect(response.headers.get("RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("RateLimit-Reset") !== null).toBe(true);
    expect(response.headers.get("Retry-After") !== null).toBe(true);
  }
});

test("createRateLimitMiddleware - custom group generator", async () => {
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
  expect(callCount).toBe(1);

  // Second request should call key generator and throw
  await expect(client.get("http://example.com")).rejects.toThrow(RateLimitError);
  // The key generator might be called multiple times due to the rate limiting logic
  expect(callCount >= 2).toBe(true);
});

test("RateLimitError - contains correct information", async () => {
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
      expect(error.name).toBe("RateLimitError");
      expect(error.remainingRequests).toBe(0);
      expect(typeof error.resetTime).toBe("number");
      expect(error.resetTime > Date.now()).toBe(true);
    } else {
      throw new Error("Expected RateLimitError");
    }
  }
});

test("RateLimiter - updateFromHeaders with standard headers", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with IETF standard headers
  const headers = new Headers({
    "ratelimit-policy": '"default";q=100;w=60',
    ratelimit: '"default";r=75;t=30',
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  expect(groupOptions.maxRequests).toBe(100);
  expect(groupOptions.windowSeconds).toBe(60);
});

test("RateLimiter - updateFromHeaders with x-ratelimit fallback headers", () => {
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
  expect(groupOptions.maxRequests).toBe(50);
  expect(groupOptions.windowSeconds).toBe(120);
});

test("RateLimiter - updateFromHeaders with x-rate-limit fallback headers", () => {
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
  expect(groupOptions.maxRequests).toBe(200);
  expect(groupOptions.windowSeconds).toBe(30);
});

test("RateLimiter - updateFromHeaders prioritizes standard over x-ratelimit", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with both IETF and x-ratelimit headers - IETF should take precedence
  const headers = new Headers({
    "ratelimit-policy": '"default";q=100;w=60',
    ratelimit: '"default";r=75;t=30',
    "x-ratelimit-limit": "50",
    "x-ratelimit-remaining": "25",
    "x-ratelimit-reset": "1234567890",
    "x-ratelimit-window": "120",
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  // Should use IETF standard values (100 limit, 60 window), not x-ratelimit values
  expect(groupOptions.maxRequests).toBe(100);
  expect(groupOptions.windowSeconds).toBe(60);
});

test("RateLimiter - updateFromHeaders with reset time calculation", () => {
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
  expect(groupOptions.maxRequests).toBe(50);
  // Window should be approximately 90 seconds
  expect(groupOptions.windowSeconds! >= 85).toBe(true);
  expect(groupOptions.windowSeconds! <= 95).toBe(true);
});

test("RateLimiter - updateFromHeaders with malformed IETF headers", () => {
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowSeconds: 5,
  });

  // Test with malformed IETF headers should fall back to x-ratelimit
  const headers = new Headers({
    "ratelimit-policy": '"default";invalid=format',
    ratelimit: '"default";bad=format',
    "x-ratelimit-limit": "50",
    "x-ratelimit-window": "120",
  });

  rateLimiter.updateFromHeaders("test-group", headers);

  const groupOptions = rateLimiter.getGroupOptions("test-group");
  expect(groupOptions.maxRequests).toBe(50);
  expect(groupOptions.windowSeconds).toBe(120);
});

test("createRateLimitHeader - creates correct header format", () => {
  const result = buildRateLimitHeader({
    policy: "default",
    remaining: 75,
    resetSeconds: 30,
  });

  expect(result).toBe('"default";r=75;t=30');
});

test("createRateLimitHeader - handles missing reset time", () => {
  const result = buildRateLimitHeader({
    policy: "default",
    remaining: 75,
    resetSeconds: 0,
  });

  expect(result).toBe('"default";r=75');
});

test("createRateLimitPolicyHeader - creates correct header format", () => {
  const result = buildRateLimitPolicyHeader({
    policy: "default",
    limit: 100,
    windowSeconds: 60,
  });

  expect(result).toBe('"default";q=100;w=60');
});

test("createRateLimitPolicyHeader - handles missing window", () => {
  const result = buildRateLimitPolicyHeader({
    policy: "default",
    limit: 100,
  });

  expect(result).toBe('"default";q=100');
});

test("parseRateLimitHeader - parses correct header format", () => {
  const result = parseRateLimitHeader('"default";r=75;t=30');

  expect(result).toEqual({
    policy: "default",
    remaining: 75,
    resetSeconds: 30,
  });
});

test("parseRateLimitHeader - handles missing parameters", () => {
  const result = parseRateLimitHeader('"default";r=75');

  expect(result).toEqual({
    policy: "default",
    remaining: 75,
  });
});

test("parseRateLimitHeader - handles invalid format", () => {
  const result = parseRateLimitHeader("invalid-format");

  expect(result).toEqual({});
});

test("parseRateLimitPolicyHeader - parses correct header format", () => {
  const result = parseRateLimitPolicyHeader('"default";q=100;w=60');

  expect(result).toEqual({
    policy: "default",
    limit: 100,
    windowSeconds: 60,
  });
});

test("parseRateLimitPolicyHeader - handles missing parameters", () => {
  const result = parseRateLimitPolicyHeader('"default";q=100');

  expect(result).toEqual({
    policy: "default",
    limit: 100,
  });
});

test("parseRateLimitPolicyHeader - handles invalid format", () => {
  const result = parseRateLimitPolicyHeader("invalid-format");

  expect(result).toEqual({});
});
