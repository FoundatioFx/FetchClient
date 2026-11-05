import { assert, expect, test } from "vite-plus/test";
import { CircuitBreaker, groupByDomain } from "../src/CircuitBreaker.ts";
import { CircuitOpenError } from "../src/CircuitBreakerMiddleware.ts";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// CircuitBreaker Core Tests
// ============================================

test("CircuitBreaker - starts in CLOSED state", () => {
  const breaker = new CircuitBreaker();
  expect(breaker.getState("http://example.com/api")).toBe("CLOSED");
});

test("CircuitBreaker - allows requests in CLOSED state", () => {
  const breaker = new CircuitBreaker();
  expect(breaker.isAllowed("http://example.com/api")).toBe(true);
  expect(breaker.isAllowed("http://example.com/api")).toBe(true);
  expect(breaker.isAllowed("http://example.com/api")).toBe(true);
});

test("CircuitBreaker - opens after failure threshold", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
  });

  const url = "http://example.com/api";

  // Record 3 failures
  breaker.recordFailure(url);
  expect(breaker.getState(url)).toBe("CLOSED");
  expect(breaker.getFailureCount(url)).toBe(1);

  breaker.recordFailure(url);
  expect(breaker.getState(url)).toBe("CLOSED");
  expect(breaker.getFailureCount(url)).toBe(2);

  breaker.recordFailure(url);
  expect(breaker.getState(url)).toBe("OPEN");
  expect(breaker.getFailureCount(url)).toBe(3);
});

test("CircuitBreaker - blocks requests in OPEN state", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 10000, // Long enough that it won't transition
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  expect(breaker.getState(url)).toBe("OPEN");
  expect(breaker.isAllowed(url)).toBe(false);
  expect(breaker.isAllowed(url)).toBe(false);
});

test("CircuitBreaker - transitions to HALF_OPEN after openDuration", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 50,
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);
  expect(breaker.getState(url)).toBe("OPEN");

  // Wait for openDuration
  await delay(60);

  // Should now be HALF_OPEN (checked via getState which checks elapsed time)
  expect(breaker.getState(url)).toBe("HALF_OPEN");

  // Should allow limited requests
  expect(breaker.isAllowed(url)).toBe(true);
});

test("CircuitBreaker - HALF_OPEN limits concurrent requests", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 50,
    halfOpenMaxAttempts: 1,
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  // Wait for HALF_OPEN
  await delay(60);

  // First request allowed
  expect(breaker.isAllowed(url)).toBe(true);

  // Second request blocked (only 1 allowed in HALF_OPEN)
  expect(breaker.isAllowed(url)).toBe(false);
});

test("CircuitBreaker - closes after success threshold in HALF_OPEN", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 50,
    successThreshold: 2,
    halfOpenMaxAttempts: 3,
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  // Wait for HALF_OPEN
  await delay(60);
  expect(breaker.getState(url)).toBe("HALF_OPEN");

  // Allow requests and record successes
  expect(breaker.isAllowed(url)).toBe(true);
  breaker.recordSuccess(url);
  expect(breaker.getState(url)).toBe("HALF_OPEN"); // Still half-open

  expect(breaker.isAllowed(url)).toBe(true);
  breaker.recordSuccess(url);
  expect(breaker.getState(url)).toBe("CLOSED"); // Now closed
});

test("CircuitBreaker - reopens on failure in HALF_OPEN", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 50,
    successThreshold: 2,
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  // Wait for HALF_OPEN
  await delay(60);
  expect(breaker.getState(url)).toBe("HALF_OPEN");

  // Allow a request
  expect(breaker.isAllowed(url)).toBe(true);

  // Record failure - should go back to OPEN
  breaker.recordFailure(url);
  expect(breaker.getState(url)).toBe("OPEN");
});

test("CircuitBreaker - groupByDomain groups by hostname", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    getGroupFunc: groupByDomain,
  });

  // Fail api1
  breaker.recordFailure("http://api1.example.com/users");
  breaker.recordFailure("http://api1.example.com/posts");
  expect(breaker.getState("http://api1.example.com/anything")).toBe("OPEN");

  // api2 should still be closed
  expect(breaker.getState("http://api2.example.com/anything")).toBe("CLOSED");
  expect(breaker.isAllowed("http://api2.example.com/anything")).toBe(true);
});

test("CircuitBreaker - failure window expiration", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    failureWindowMs: 50,
  });

  const url = "http://example.com/api";

  // Record 2 failures
  breaker.recordFailure(url);
  breaker.recordFailure(url);
  expect(breaker.getFailureCount(url)).toBe(2);

  // Wait for window to expire
  await delay(60);

  // Old failures should be cleaned up
  expect(breaker.getFailureCount(url)).toBe(0);

  // Need fresh failures to open
  breaker.recordFailure(url);
  expect(breaker.getState(url)).toBe("CLOSED");
});

test("CircuitBreaker - manual reset closes circuit", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);
  expect(breaker.getState(url)).toBe("OPEN");

  // Manual reset
  breaker.reset(url);
  expect(breaker.getState(url)).toBe("CLOSED");
  expect(breaker.isAllowed(url)).toBe(true);
});

test("CircuitBreaker - manual trip opens circuit", () => {
  const breaker = new CircuitBreaker();

  const url = "http://example.com/api";

  expect(breaker.getState(url)).toBe("CLOSED");

  // Manual trip
  breaker.trip(url);
  expect(breaker.getState(url)).toBe("OPEN");
  expect(breaker.isAllowed(url)).toBe(false);
});

test("CircuitBreaker - callbacks are triggered", async () => {
  const events: string[] = [];

  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 50,
    successThreshold: 1,
    onStateChange: (from, to) => events.push(`${from}->${to}`),
    onOpen: (group) => events.push(`open:${group}`),
    onHalfOpen: (group) => events.push(`halfOpen:${group}`),
    onClose: (group) => events.push(`close:${group}`),
  });

  const url = "http://example.com/api";

  // Open circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);
  expect(events).toEqual(["CLOSED->OPEN", "open:global"]);

  // Wait for HALF_OPEN
  await delay(60);
  breaker.isAllowed(url); // Triggers transition check
  expect(events).toEqual(["CLOSED->OPEN", "open:global", "OPEN->HALF_OPEN", "halfOpen:global"]);

  // Close circuit
  breaker.recordSuccess(url);
  expect(events).toEqual([
    "CLOSED->OPEN",
    "open:global",
    "OPEN->HALF_OPEN",
    "halfOpen:global",
    "HALF_OPEN->CLOSED",
    "close:global",
  ]);
});

test("CircuitBreaker - per-group options override global", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 5,
    groups: {
      "api.example.com": { failureThreshold: 2 },
    },
    getGroupFunc: groupByDomain,
  });

  // api.example.com has threshold of 2
  breaker.recordFailure("http://api.example.com/users");
  breaker.recordFailure("http://api.example.com/users");
  expect(breaker.getState("http://api.example.com/users")).toBe("OPEN");

  // other.example.com has threshold of 5
  breaker.recordFailure("http://other.example.com/users");
  breaker.recordFailure("http://other.example.com/users");
  expect(breaker.getState("http://other.example.com/users")).toBe("CLOSED");
});

test("CircuitBreaker - getTimeSinceOpen returns correct value", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
  });

  const url = "http://example.com/api";

  // Not open yet
  expect(breaker.getTimeSinceOpen(url)).toBeNull();

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  // Should return small positive number
  const timeSince = breaker.getTimeSinceOpen(url);
  expect(timeSince).not.toBeNull();
  expect(timeSince).toBeGreaterThanOrEqual(0);
  expect(timeSince).toBeLessThan(100); // Should be very recent
});

test("CircuitBreaker - getTimeUntilHalfOpen returns correct value", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 100,
  });

  const url = "http://example.com/api";

  // Not open yet
  expect(breaker.getTimeUntilHalfOpen(url)).toBeNull();

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  // Should return time remaining
  const timeUntil = breaker.getTimeUntilHalfOpen(url);
  expect(timeUntil).not.toBeNull();
  expect(timeUntil).toBeGreaterThan(0);
  expect(timeUntil).toBeLessThanOrEqual(100);

  // Wait and check again
  await delay(60);
  const timeUntil2 = breaker.getTimeUntilHalfOpen(url);
  expect(timeUntil2).not.toBeNull();
  expect(timeUntil2).toBeLessThan(timeUntil!);
});

// ============================================
// CircuitBreakerMiddleware Tests
// ============================================

test("CircuitBreakerMiddleware - allows requests when closed", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 42 });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 5,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://api.example.com/api/data");

  expect(response.status).toBe(200);
  expect(response.data).toEqual({ value: 42 });
});

test("CircuitBreakerMiddleware - records failures for 5xx", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 2,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const breaker = provider.circuitBreaker!;

  // First failure
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  expect(breaker.getFailureCount("https://api.example.com/api/data")).toBe(1);

  // Second failure - opens circuit
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  expect(breaker.getState("https://api.example.com/api/data")).toBe("OPEN");
});

test("CircuitBreakerMiddleware - records failures for 429", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(429, { error: "Too Many Requests" });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 2,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const breaker = provider.circuitBreaker!;

  // 429 should count as failure
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [429],
  });
  expect(breaker.getFailureCount("https://api.example.com/api/data")).toBe(1);
});

test("CircuitBreakerMiddleware - returns 503 when open", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 10000,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();

  // Open the circuit
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // Next request should get 503
  const response = await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [503],
  });

  expect(response.status).toBe(503);
  assert(response.headers.get("Retry-After"));
  assert(response.problem.detail?.includes("Circuit breaker is open"));

  // Mock should not have been called for the 503 request
  expect(mocks.history.all.length).toBe(2);
});

test("CircuitBreakerMiddleware - throws CircuitOpenError when configured", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 10000,
    throwOnOpen: true,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();

  // Open the circuit
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // Next request should throw
  try {
    await client.getJSON("https://api.example.com/api/data");
    throw new Error("Should have thrown");
  } catch (e) {
    assert(e instanceof CircuitOpenError);
    expect(e.group).toBe("global");
    expect(e.retryAfter).toBeGreaterThan(0);
  }
});

test("CircuitBreakerMiddleware - records network errors as failures", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").networkError("Connection refused");

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 2,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const breaker = provider.circuitBreaker!;

  // Network error should count as failure
  try {
    await client.getJSON("https://api.example.com/api/data");
  } catch {
    // Expected
  }

  expect(breaker.getFailureCount("https://api.example.com/api/data")).toBe(1);
});

test("CircuitBreakerMiddleware - per-domain isolation", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Error" });

  const provider = new FetchClientProvider();
  provider.usePerDomainCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 10000,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const breaker = provider.circuitBreaker!;

  // Fail api1
  await client.getJSON("https://api1.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  await client.getJSON("https://api1.example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // api1 should be open
  expect(breaker.getState("https://api1.example.com/api/data")).toBe("OPEN");

  // api2 should still be closed
  expect(breaker.getState("https://api2.example.com/api/data")).toBe("CLOSED");
});

test("CircuitBreakerMiddleware - custom isFailure function", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(400, { error: "Bad Request" });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 2,
    isFailure: (response) => response.status >= 400, // Count all 4xx as failures
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const breaker = provider.circuitBreaker!;

  // 400 should count as failure with custom function
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [400],
  });
  expect(breaker.getFailureCount("https://api.example.com/api/data")).toBe(1);
});

test("CircuitBreakerMiddleware - recovery after HALF_OPEN success", async () => {
  const mocks = new MockRegistry();
  // First 2 requests fail, then succeed
  mocks.onGet("/api/data").replyOnce(500, { error: "Error" });
  mocks.onGet("/api/data").replyOnce(500, { error: "Error" });
  mocks.onGet("/api/data").reply(200, { value: 42 });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 50,
    successThreshold: 1,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const breaker = provider.circuitBreaker!;

  // Open the circuit
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  expect(breaker.getState("https://api.example.com/api/data")).toBe("OPEN");

  // Wait for HALF_OPEN
  await delay(60);

  // Successful request should close the circuit
  const response = await client.getJSON("https://api.example.com/api/data");
  expect(response.status).toBe(200);
  expect(breaker.getState("https://api.example.com/api/data")).toBe("CLOSED");
});

test("CircuitBreakerMiddleware - combined with rate limiting", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 42 });

  const provider = new FetchClientProvider();
  provider.useRateLimit({ maxRequests: 10, windowSeconds: 60 });
  provider.useCircuitBreaker({ failureThreshold: 5 });
  mocks.install(provider);

  const client = provider.getFetchClient();

  // Both middlewares should work together
  const response = await client.getJSON("https://api.example.com/api/data");
  expect(response.status).toBe(200);

  // Verify both are configured
  assert(provider.rateLimiter);
  assert(provider.circuitBreaker);
});

test("CircuitBreakerMiddleware - removeCircuitBreaker works", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Error" });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({ failureThreshold: 1 });
  mocks.install(provider);

  const client = provider.getFetchClient();

  // Trip the circuit
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  assert(provider.circuitBreaker);

  // Remove circuit breaker
  provider.removeCircuitBreaker();
  expect(provider.circuitBreaker).toBeUndefined();

  // Requests should now go through (no 503)
  const response = await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  expect(response.status).toBe(500); // Real response, not 503
});
