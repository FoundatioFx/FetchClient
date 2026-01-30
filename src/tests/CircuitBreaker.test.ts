import { assert, assertEquals, assertFalse } from "@std/assert";
import { CircuitBreaker, groupByDomain } from "../CircuitBreaker.ts";
import { CircuitOpenError } from "../CircuitBreakerMiddleware.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// CircuitBreaker Core Tests
// ============================================

Deno.test("CircuitBreaker - starts in CLOSED state", () => {
  const breaker = new CircuitBreaker();
  assertEquals(breaker.getState("http://example.com/api"), "CLOSED");
});

Deno.test("CircuitBreaker - allows requests in CLOSED state", () => {
  const breaker = new CircuitBreaker();
  assert(breaker.isAllowed("http://example.com/api"));
  assert(breaker.isAllowed("http://example.com/api"));
  assert(breaker.isAllowed("http://example.com/api"));
});

Deno.test("CircuitBreaker - opens after failure threshold", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
  });

  const url = "http://example.com/api";

  // Record 3 failures
  breaker.recordFailure(url);
  assertEquals(breaker.getState(url), "CLOSED");
  assertEquals(breaker.getFailureCount(url), 1);

  breaker.recordFailure(url);
  assertEquals(breaker.getState(url), "CLOSED");
  assertEquals(breaker.getFailureCount(url), 2);

  breaker.recordFailure(url);
  assertEquals(breaker.getState(url), "OPEN");
  assertEquals(breaker.getFailureCount(url), 3);
});

Deno.test("CircuitBreaker - blocks requests in OPEN state", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 10000, // Long enough that it won't transition
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  assertEquals(breaker.getState(url), "OPEN");
  assertFalse(breaker.isAllowed(url));
  assertFalse(breaker.isAllowed(url));
});

Deno.test("CircuitBreaker - transitions to HALF_OPEN after openDuration", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 50,
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);
  assertEquals(breaker.getState(url), "OPEN");

  // Wait for openDuration
  await delay(60);

  // Should now be HALF_OPEN (checked via getState which checks elapsed time)
  assertEquals(breaker.getState(url), "HALF_OPEN");

  // Should allow limited requests
  assert(breaker.isAllowed(url));
});

Deno.test("CircuitBreaker - HALF_OPEN limits concurrent requests", async () => {
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
  assert(breaker.isAllowed(url));

  // Second request blocked (only 1 allowed in HALF_OPEN)
  assertFalse(breaker.isAllowed(url));
});

Deno.test("CircuitBreaker - closes after success threshold in HALF_OPEN", async () => {
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
  assertEquals(breaker.getState(url), "HALF_OPEN");

  // Allow requests and record successes
  assert(breaker.isAllowed(url));
  breaker.recordSuccess(url);
  assertEquals(breaker.getState(url), "HALF_OPEN"); // Still half-open

  assert(breaker.isAllowed(url));
  breaker.recordSuccess(url);
  assertEquals(breaker.getState(url), "CLOSED"); // Now closed
});

Deno.test("CircuitBreaker - reopens on failure in HALF_OPEN", async () => {
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
  assertEquals(breaker.getState(url), "HALF_OPEN");

  // Allow a request
  assert(breaker.isAllowed(url));

  // Record failure - should go back to OPEN
  breaker.recordFailure(url);
  assertEquals(breaker.getState(url), "OPEN");
});

Deno.test("CircuitBreaker - groupByDomain groups by hostname", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    getGroupFunc: groupByDomain,
  });

  // Fail api1
  breaker.recordFailure("http://api1.example.com/users");
  breaker.recordFailure("http://api1.example.com/posts");
  assertEquals(breaker.getState("http://api1.example.com/anything"), "OPEN");

  // api2 should still be closed
  assertEquals(breaker.getState("http://api2.example.com/anything"), "CLOSED");
  assert(breaker.isAllowed("http://api2.example.com/anything"));
});

Deno.test("CircuitBreaker - failure window expiration", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    failureWindowMs: 50,
  });

  const url = "http://example.com/api";

  // Record 2 failures
  breaker.recordFailure(url);
  breaker.recordFailure(url);
  assertEquals(breaker.getFailureCount(url), 2);

  // Wait for window to expire
  await delay(60);

  // Old failures should be cleaned up
  assertEquals(breaker.getFailureCount(url), 0);

  // Need fresh failures to open
  breaker.recordFailure(url);
  assertEquals(breaker.getState(url), "CLOSED");
});

Deno.test("CircuitBreaker - manual reset closes circuit", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
  });

  const url = "http://example.com/api";

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);
  assertEquals(breaker.getState(url), "OPEN");

  // Manual reset
  breaker.reset(url);
  assertEquals(breaker.getState(url), "CLOSED");
  assert(breaker.isAllowed(url));
});

Deno.test("CircuitBreaker - manual trip opens circuit", () => {
  const breaker = new CircuitBreaker();

  const url = "http://example.com/api";

  assertEquals(breaker.getState(url), "CLOSED");

  // Manual trip
  breaker.trip(url);
  assertEquals(breaker.getState(url), "OPEN");
  assertFalse(breaker.isAllowed(url));
});

Deno.test("CircuitBreaker - callbacks are triggered", async () => {
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
  assertEquals(events, ["CLOSED->OPEN", "open:global"]);

  // Wait for HALF_OPEN
  await delay(60);
  breaker.isAllowed(url); // Triggers transition check
  assertEquals(events, [
    "CLOSED->OPEN",
    "open:global",
    "OPEN->HALF_OPEN",
    "halfOpen:global",
  ]);

  // Close circuit
  breaker.recordSuccess(url);
  assertEquals(events, [
    "CLOSED->OPEN",
    "open:global",
    "OPEN->HALF_OPEN",
    "halfOpen:global",
    "HALF_OPEN->CLOSED",
    "close:global",
  ]);
});

Deno.test("CircuitBreaker - per-group options override global", () => {
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
  assertEquals(breaker.getState("http://api.example.com/users"), "OPEN");

  // other.example.com has threshold of 5
  breaker.recordFailure("http://other.example.com/users");
  breaker.recordFailure("http://other.example.com/users");
  assertEquals(breaker.getState("http://other.example.com/users"), "CLOSED");
});

Deno.test("CircuitBreaker - getTimeSinceOpen returns correct value", () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
  });

  const url = "http://example.com/api";

  // Not open yet
  assertEquals(breaker.getTimeSinceOpen(url), null);

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  // Should return small positive number
  const timeSince = breaker.getTimeSinceOpen(url);
  assert(timeSince !== null);
  assert(timeSince >= 0);
  assert(timeSince < 100); // Should be very recent
});

Deno.test("CircuitBreaker - getTimeUntilHalfOpen returns correct value", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 100,
  });

  const url = "http://example.com/api";

  // Not open yet
  assertEquals(breaker.getTimeUntilHalfOpen(url), null);

  // Open the circuit
  breaker.recordFailure(url);
  breaker.recordFailure(url);

  // Should return time remaining
  const timeUntil = breaker.getTimeUntilHalfOpen(url);
  assert(timeUntil !== null);
  assert(timeUntil > 0);
  assert(timeUntil <= 100);

  // Wait and check again
  await delay(60);
  const timeUntil2 = breaker.getTimeUntilHalfOpen(url);
  assert(timeUntil2 !== null);
  assert(timeUntil2 < timeUntil!);
});

// ============================================
// CircuitBreakerMiddleware Tests
// ============================================

Deno.test("CircuitBreakerMiddleware - allows requests when closed", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 42 });

  const provider = new FetchClientProvider();
  provider.useCircuitBreaker({
    failureThreshold: 5,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://api.example.com/api/data");

  assertEquals(response.status, 200);
  assertEquals(response.data, { value: 42 });
});

Deno.test("CircuitBreakerMiddleware - records failures for 5xx", async () => {
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
  assertEquals(breaker.getFailureCount("https://api.example.com/api/data"), 1);

  // Second failure - opens circuit
  await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  assertEquals(breaker.getState("https://api.example.com/api/data"), "OPEN");
});

Deno.test("CircuitBreakerMiddleware - records failures for 429", async () => {
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
  assertEquals(breaker.getFailureCount("https://api.example.com/api/data"), 1);
});

Deno.test("CircuitBreakerMiddleware - returns 503 when open", async () => {
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

  assertEquals(response.status, 503);
  assert(response.headers.get("Retry-After"));
  assert(response.problem.detail?.includes("Circuit breaker is open"));

  // Mock should not have been called for the 503 request
  assertEquals(mocks.history.all.length, 2);
});

Deno.test("CircuitBreakerMiddleware - throws CircuitOpenError when configured", async () => {
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
    assertEquals(e.group, "global");
    assert(e.retryAfter > 0);
  }
});

Deno.test("CircuitBreakerMiddleware - records network errors as failures", async () => {
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

  assertEquals(breaker.getFailureCount("https://api.example.com/api/data"), 1);
});

Deno.test("CircuitBreakerMiddleware - per-domain isolation", async () => {
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
  assertEquals(breaker.getState("https://api1.example.com/api/data"), "OPEN");

  // api2 should still be closed
  assertEquals(breaker.getState("https://api2.example.com/api/data"), "CLOSED");
});

Deno.test("CircuitBreakerMiddleware - custom isFailure function", async () => {
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
  assertEquals(breaker.getFailureCount("https://api.example.com/api/data"), 1);
});

Deno.test("CircuitBreakerMiddleware - recovery after HALF_OPEN success", async () => {
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
  assertEquals(breaker.getState("https://api.example.com/api/data"), "OPEN");

  // Wait for HALF_OPEN
  await delay(60);

  // Successful request should close the circuit
  const response = await client.getJSON("https://api.example.com/api/data");
  assertEquals(response.status, 200);
  assertEquals(breaker.getState("https://api.example.com/api/data"), "CLOSED");
});

Deno.test("CircuitBreakerMiddleware - combined with rate limiting", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 42 });

  const provider = new FetchClientProvider();
  provider.useRateLimit({ maxRequests: 10, windowSeconds: 60 });
  provider.useCircuitBreaker({ failureThreshold: 5 });
  mocks.install(provider);

  const client = provider.getFetchClient();

  // Both middlewares should work together
  const response = await client.getJSON("https://api.example.com/api/data");
  assertEquals(response.status, 200);

  // Verify both are configured
  assert(provider.rateLimiter);
  assert(provider.circuitBreaker);
});

Deno.test("CircuitBreakerMiddleware - removeCircuitBreaker works", async () => {
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
  assertEquals(provider.circuitBreaker, undefined);

  // Requests should now go through (no 503)
  const response = await client.getJSON("https://api.example.com/api/data", {
    expectedStatusCodes: [500],
  });
  assertEquals(response.status, 500); // Real response, not 503
});
