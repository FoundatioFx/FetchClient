import { assertEquals, assertExists } from "@std/assert";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { ProblemDetails } from "../ProblemDetails.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

Deno.test("FetchClientProvider - creates client with shared cache", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  const client1 = provider.getFetchClient();
  const client2 = provider.getFetchClient();

  // Both clients share the same cache
  assertEquals(client1.cache, client2.cache);
  assertEquals(client1.cache, provider.cache);

  // Cache an entry with client1
  await client1.getJSON("/api/data", {
    cacheKey: ["data"],
    cacheDuration: 60000,
  });

  // client2 should get cached data (no new request)
  await client2.getJSON("/api/data", {
    cacheKey: ["data"],
    cacheDuration: 60000,
  });

  // Only one request was made
  assertEquals(mocks.history.get.length, 1);

  mocks.restore();
});

Deno.test("FetchClientProvider - setBaseUrl applies to all clients", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, [{ id: 1 }]);
  mocks.install(provider);

  provider.setBaseUrl("https://api.example.com");

  const client = provider.getFetchClient();
  await client.getJSON("/users");

  assertEquals(mocks.history.get[0].url, "https://api.example.com/users");

  mocks.restore();
});

Deno.test("FetchClientProvider - setAccessTokenFunc adds authorization header", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  provider.setAccessTokenFunc(() => "test-token-123");

  const client = provider.getFetchClient();
  await client.getJSON("/api/data");

  assertEquals(
    mocks.history.get[0].headers.get("Authorization"),
    "Bearer test-token-123",
  );

  mocks.restore();
});

Deno.test("FetchClientProvider - useMiddleware applies to all clients", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  const logs: string[] = [];
  provider.useMiddleware(async (ctx, next) => {
    logs.push(`before: ${ctx.request.url}`);
    await next();
    logs.push(`after: ${ctx.response?.status}`);
  });

  const client = provider.getFetchClient();
  await client.getJSON("/api/data");

  assertEquals(logs.length, 2);
  assertEquals(logs[0].includes("/api/data"), true);
  assertEquals(logs[1], "after: 200");

  mocks.restore();
});

Deno.test("FetchClientProvider - multiple middleware execute in order", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  const order: number[] = [];

  provider.useMiddleware(async (_ctx, next) => {
    order.push(1);
    await next();
    order.push(6);
  });

  provider.useMiddleware(async (_ctx, next) => {
    order.push(2);
    await next();
    order.push(5);
  });

  provider.useMiddleware(async (_ctx, next) => {
    order.push(3);
    await next();
    order.push(4);
  });

  const client = provider.getFetchClient();
  await client.getJSON("/api/data");

  assertEquals(order, [1, 2, 3, 4, 5, 6]);

  mocks.restore();
});

Deno.test("FetchClientProvider - loading state tracks requests", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  const loadingStates: boolean[] = [];
  provider.loading.on((isLoading) => {
    if (isLoading !== undefined) {
      loadingStates.push(isLoading);
    }
  });

  assertEquals(provider.isLoading, false);
  assertEquals(provider.requestCount, 0);

  const client = provider.getFetchClient();
  await client.getJSON("/api/data");

  // Should have toggled to true then back to false
  assertEquals(loadingStates, [true, false]);
  assertEquals(provider.isLoading, false);

  mocks.restore();
});

Deno.test("FetchClientProvider - requestCount tracks concurrent requests", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data1").delay(50).reply(200, { value: 1 });
  mocks.onGet("/api/data2").delay(50).reply(200, { value: 2 });
  mocks.install(provider);

  const client = provider.getFetchClient();

  // Start two concurrent requests
  const promise1 = client.getJSON("/api/data1");
  const promise2 = client.getJSON("/api/data2");

  // Should have 2 in-flight requests
  assertEquals(provider.requestCount, 2);
  assertEquals(provider.isLoading, true);

  await Promise.all([promise1, promise2]);

  assertEquals(provider.requestCount, 0);
  assertEquals(provider.isLoading, false);

  mocks.restore();
});

Deno.test("FetchClientProvider - applyOptions merges options", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, []);
  mocks.install(provider);

  provider.applyOptions({ baseUrl: "https://api.example.com" });

  const client = provider.getFetchClient();
  await client.getJSON("/users");

  assertEquals(mocks.history.get[0].url, "https://api.example.com/users");

  mocks.restore();
});

Deno.test("FetchClientProvider - setModelValidator validates request data", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onPost("/api/users").reply(201, { id: 1 });
  mocks.install(provider);

  provider.setModelValidator((data) => {
    const d = data as { email?: string };
    if (!d?.email) {
      const problem = new ProblemDetails();
      problem.errors.email = ["Email is required"];
      return Promise.resolve(problem);
    }
    return Promise.resolve(null);
  });

  const client = provider.getFetchClient();

  // Invalid data - should fail validation
  const response1 = await client.postJSON("/api/users", { name: "Test" });
  assertEquals(response1.ok, false);
  assertEquals(response1.problem.errors.email?.[0], "Email is required");
  assertEquals(mocks.history.post.length, 0); // No request made

  // Valid data - should succeed
  const response2 = await client.postJSON("/api/users", {
    name: "Test",
    email: "test@example.com",
  });
  assertEquals(response2.ok, true);
  assertEquals(mocks.history.post.length, 1);

  mocks.restore();
});

Deno.test("FetchClientProvider - custom fetch function", async () => {
  let fetchCalled = false;
  const customFetch: typeof fetch = (_input, _init) => {
    fetchCalled = true;
    return Promise.resolve(
      new Response(JSON.stringify({ custom: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  const provider = new FetchClientProvider(customFetch);
  const client = provider.getFetchClient();

  const response = await client.getJSON("/api/data");

  assertEquals(fetchCalled, true);
  assertEquals(response.data, { custom: true });
});

Deno.test("FetchClientProvider - fetch setter works", async () => {
  const provider = new FetchClientProvider();

  let fetchCalled = false;
  provider.fetch = () => {
    fetchCalled = true;
    return Promise.resolve(
      new Response(JSON.stringify({ updated: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  const client = provider.getFetchClient();
  const response = await client.getJSON("/api/data");

  assertEquals(fetchCalled, true);
  assertEquals(response.data, { updated: true });
});

Deno.test("FetchClientProvider - useRateLimit enables rate limiting", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  provider.useRateLimit({
    maxRequests: 2,
    windowSeconds: 60,
    throwOnRateLimit: false,
  });

  assertExists(provider.rateLimiter);

  const client = provider.getFetchClient();

  // First two requests should succeed
  const response1 = await client.getJSON("/api/data", {
    expectedStatusCodes: [429],
  });
  const response2 = await client.getJSON("/api/data", {
    expectedStatusCodes: [429],
  });
  assertEquals(response1.status, 200);
  assertEquals(response2.status, 200);

  // Third request should be rate limited
  const response3 = await client.getJSON("/api/data", {
    expectedStatusCodes: [429],
  });
  assertEquals(response3.status, 429);

  mocks.restore();
});

Deno.test("FetchClientProvider - removeRateLimit disables rate limiting", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  provider.useRateLimit({
    maxRequests: 1,
    windowSeconds: 60,
    throwOnRateLimit: false,
  });

  const client = provider.getFetchClient();

  // First request succeeds
  await client.getJSON("/api/data", { expectedStatusCodes: [429] });

  // Second would be rate limited
  const response2 = await client.getJSON("/api/data", {
    expectedStatusCodes: [429],
  });
  assertEquals(response2.status, 429);

  // Remove rate limiting
  provider.removeRateLimit();
  assertEquals(provider.rateLimiter, undefined);

  // Now requests should work (need new client to pick up changes)
  const client2 = provider.getFetchClient();
  const response3 = await client2.getJSON("/api/data");
  assertEquals(response3.status, 200);

  mocks.restore();
});

Deno.test("FetchClientProvider - useCircuitBreaker enables circuit breaker", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Server error" });
  mocks.install(provider);

  provider.useCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 30000,
  });

  assertExists(provider.circuitBreaker);

  const client = provider.getFetchClient();

  // Trigger failures to open circuit
  await client.getJSON("/api/data", { expectedStatusCodes: [500, 503] });
  await client.getJSON("/api/data", { expectedStatusCodes: [500, 503] });

  // Circuit should be open now
  assertEquals(provider.circuitBreaker!.getState("/api/data"), "OPEN");

  // Next request should return 503 without hitting the API
  const response = await client.getJSON("/api/data", {
    expectedStatusCodes: [503],
  });
  assertEquals(response.status, 503);
  assertEquals(mocks.history.get.length, 2); // Only 2 requests made

  mocks.restore();
});

Deno.test("FetchClientProvider - removeCircuitBreaker disables circuit breaker", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Server error" });
  mocks.install(provider);

  provider.useCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 30000,
  });

  const client = provider.getFetchClient();

  // Trigger failures to open circuit
  await client.getJSON("/api/data", { expectedStatusCodes: [500] });
  await client.getJSON("/api/data", { expectedStatusCodes: [500] });

  // Remove circuit breaker
  provider.removeCircuitBreaker();
  assertEquals(provider.circuitBreaker, undefined);

  // Now requests should go through (need new client)
  const client2 = provider.getFetchClient();
  const response = await client2.getJSON("/api/data", {
    expectedStatusCodes: [500],
  });
  assertEquals(response.status, 500); // Actual response, not 503

  mocks.restore();
});

Deno.test("FetchClientProvider - getFetchClient inherits provider middleware", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  const logs: string[] = [];
  provider.useMiddleware(async (_ctx, next) => {
    logs.push("provider");
    await next();
  });

  // Client without options inherits provider middleware
  const client = provider.getFetchClient();
  await client.getJSON("/api/data");

  assertEquals(logs, ["provider"]);

  mocks.restore();
});

Deno.test("FetchClientProvider - client.use() adds to provider middleware", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  const logs: string[] = [];
  provider.useMiddleware(async (_ctx, next) => {
    logs.push("provider");
    await next();
  });

  const client = provider.getFetchClient();
  client.use(async (_ctx, next) => {
    logs.push("client");
    await next();
  });

  await client.getJSON("/api/data");

  // Both middleware run - provider first, then client
  assertEquals(logs, ["provider", "client"]);

  mocks.restore();
});

Deno.test("FetchClientProvider - counter is accessible", () => {
  const provider = new FetchClientProvider();

  assertExists(provider.counter);
  assertEquals(provider.counter.count, 0);
});

Deno.test("FetchClientProvider - options getter and setter work", () => {
  const provider = new FetchClientProvider();

  const originalOptions = provider.options;
  assertExists(originalOptions);

  provider.options = { baseUrl: "https://test.com" };
  assertEquals(provider.options.baseUrl, "https://test.com");
});

Deno.test("FetchClientProvider - usePerDomainRateLimit groups by domain", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet(/.*/).reply(200, { value: 1 });
  mocks.install(provider);

  provider.usePerDomainRateLimit({
    maxRequests: 1,
    windowSeconds: 60,
    throwOnRateLimit: false,
  });

  const client = provider.getFetchClient();

  // First request to domain1 succeeds
  const r1 = await client.getJSON("https://domain1.com/api/data", {
    expectedStatusCodes: [429],
  });
  assertEquals(r1.status, 200);

  // Second request to domain1 is rate limited
  const r2 = await client.getJSON("https://domain1.com/api/other", {
    expectedStatusCodes: [429],
  });
  assertEquals(r2.status, 429);

  // First request to domain2 succeeds (different domain)
  const r3 = await client.getJSON("https://domain2.com/api/data", {
    expectedStatusCodes: [429],
  });
  assertEquals(r3.status, 200);

  mocks.restore();
});

Deno.test("FetchClientProvider - usePerDomainCircuitBreaker isolates domains", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("https://failing.com/api").reply(500, { error: "fail" });
  mocks.onGet("https://working.com/api").reply(200, { value: 1 });
  mocks.install(provider);

  provider.usePerDomainCircuitBreaker({
    failureThreshold: 1,
    openDurationMs: 30000,
  });

  const client = provider.getFetchClient();

  // Fail on failing.com to open its circuit
  await client.getJSON("https://failing.com/api", {
    expectedStatusCodes: [500, 503],
  });

  // failing.com circuit is open
  const r1 = await client.getJSON("https://failing.com/api", {
    expectedStatusCodes: [503],
  });
  assertEquals(r1.status, 503);

  // working.com should still work (separate circuit)
  const r2 = await client.getJSON("https://working.com/api");
  assertEquals(r2.status, 200);

  mocks.restore();
});
