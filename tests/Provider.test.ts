import { expect, test } from "vite-plus/test";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { ProblemDetails } from "../src/ProblemDetails.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

test("FetchClientProvider - creates client with shared cache", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  const client1 = provider.getFetchClient();
  const client2 = provider.getFetchClient();

  // Both clients share the same cache
  expect(client1.cache).toEqual(client2.cache);
  expect(client1.cache).toEqual(provider.cache);

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
  expect(mocks.history.get.length).toBe(1);

  mocks.restore();
});

test("FetchClientProvider - setBaseUrl applies to all clients", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, [{ id: 1 }]);
  mocks.install(provider);

  provider.setBaseUrl("https://api.example.com");

  const client = provider.getFetchClient();
  await client.getJSON("/users");

  expect(mocks.history.get[0].url).toBe("https://api.example.com/users");

  mocks.restore();
});

test("FetchClientProvider - setAccessTokenFunc adds authorization header", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  provider.setAccessTokenFunc(() => "test-token-123");

  const client = provider.getFetchClient();
  await client.getJSON("/api/data");

  expect(mocks.history.get[0].headers.get("Authorization")).toBe("Bearer test-token-123");

  mocks.restore();
});

test("FetchClientProvider - useMiddleware applies to all clients", async () => {
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

  expect(logs.length).toBe(2);
  expect(logs[0].includes("/api/data")).toBe(true);
  expect(logs[1]).toBe("after: 200");

  mocks.restore();
});

test("FetchClientProvider - multiple middleware execute in order", async () => {
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

  expect(order).toEqual([1, 2, 3, 4, 5, 6]);

  mocks.restore();
});

test("FetchClientProvider - loading state tracks requests", async () => {
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

  expect(provider.isLoading).toBe(false);
  expect(provider.requestCount).toBe(0);

  const client = provider.getFetchClient();
  await client.getJSON("/api/data");

  // Should have toggled to true then back to false
  expect(loadingStates).toEqual([true, false]);
  expect(provider.isLoading).toBe(false);

  mocks.restore();
});

test("FetchClientProvider - requestCount tracks concurrent requests", async () => {
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
  expect(provider.requestCount).toBe(2);
  expect(provider.isLoading).toBe(true);

  await Promise.all([promise1, promise2]);

  expect(provider.requestCount).toBe(0);
  expect(provider.isLoading).toBe(false);

  mocks.restore();
});

test("FetchClientProvider - applyOptions merges options", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, []);
  mocks.install(provider);

  provider.applyOptions({ baseUrl: "https://api.example.com" });

  const client = provider.getFetchClient();
  await client.getJSON("/users");

  expect(mocks.history.get[0].url).toBe("https://api.example.com/users");

  mocks.restore();
});

test("FetchClientProvider - applyOptions deep merges defaultRequestOptions", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, []);
  mocks.install(provider);

  provider.applyOptions({
    defaultRequestOptions: {
      headers: {
        "X-First": "1",
      },
      params: {
        a: "1",
      },
    },
  });

  provider.applyOptions({
    defaultRequestOptions: {
      headers: {
        "X-Second": "2",
      },
      params: {
        b: "2",
      },
    },
  });

  const client = provider.getFetchClient();
  await client.getJSON("/users");

  const request = mocks.history.get[0];
  const url = new URL(request.url);
  expect(request.headers.get("X-First")).toBe("1");
  expect(request.headers.get("X-Second")).toBe("2");
  expect(url.searchParams.get("a")).toBe("1");
  expect(url.searchParams.get("b")).toBe("2");

  mocks.restore();
});

test("FetchClientProvider - getFetchClient deep merges defaultRequestOptions", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, []);
  mocks.install(provider);

  provider.applyOptions({
    defaultRequestOptions: {
      headers: {
        "X-Provider": "provider",
      },
      params: {
        source: "provider",
      },
    },
  });

  const client = provider.getFetchClient({
    defaultRequestOptions: {
      headers: {
        "X-Client": "client",
      },
      params: {
        scope: "client",
      },
    },
  });

  await client.getJSON("/users");

  const request = mocks.history.get[0];
  const url = new URL(request.url);
  expect(request.headers.get("X-Provider")).toBe("provider");
  expect(request.headers.get("X-Client")).toBe("client");
  expect(url.searchParams.get("source")).toBe("provider");
  expect(url.searchParams.get("scope")).toBe("client");

  mocks.restore();
});

test("FetchClientProvider - setModelValidator validates request data", async () => {
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
  expect(response1.ok).toBe(false);
  expect(response1.problem.errors.email?.[0]).toBe("Email is required");
  expect(mocks.history.post.length).toBe(0); // No request made

  // Valid data - should succeed
  const response2 = await client.postJSON("/api/users", {
    name: "Test",
    email: "test@example.com",
  });
  expect(response2.ok).toBe(true);
  expect(mocks.history.post.length).toBe(1);

  mocks.restore();
});

test("FetchClientProvider - custom fetch function", async () => {
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

  expect(fetchCalled).toBe(true);
  expect(response.data).toEqual({ custom: true });
});

test("FetchClientProvider - fetch setter works", async () => {
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

  expect(fetchCalled).toBe(true);
  expect(response.data).toEqual({ updated: true });
});

test("FetchClientProvider - useRateLimit enables rate limiting", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 1 });
  mocks.install(provider);

  provider.useRateLimit({
    maxRequests: 2,
    windowSeconds: 60,
    throwOnRateLimit: false,
  });

  expect(provider.rateLimiter).toBeDefined();

  const client = provider.getFetchClient();

  // First two requests should succeed
  const response1 = await client.getJSON("/api/data", {
    expectedStatusCodes: [429],
  });
  const response2 = await client.getJSON("/api/data", {
    expectedStatusCodes: [429],
  });
  expect(response1.status).toBe(200);
  expect(response2.status).toBe(200);

  // Third request should be rate limited
  const response3 = await client.getJSON("/api/data", {
    expectedStatusCodes: [429],
  });
  expect(response3.status).toBe(429);

  mocks.restore();
});

test("FetchClientProvider - removeRateLimit disables rate limiting", async () => {
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
  expect(response2.status).toBe(429);

  // Remove rate limiting
  provider.removeRateLimit();
  expect(provider.rateLimiter).toBeUndefined();

  // Now requests should work (need new client to pick up changes)
  const client2 = provider.getFetchClient();
  const response3 = await client2.getJSON("/api/data");
  expect(response3.status).toBe(200);

  mocks.restore();
});

test("FetchClientProvider - useCircuitBreaker enables circuit breaker", async () => {
  const provider = new FetchClientProvider();
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Server error" });
  mocks.install(provider);

  provider.useCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 30000,
  });

  expect(provider.circuitBreaker).toBeDefined();

  const client = provider.getFetchClient();

  // Trigger failures to open circuit
  await client.getJSON("/api/data", { expectedStatusCodes: [500, 503] });
  await client.getJSON("/api/data", { expectedStatusCodes: [500, 503] });

  // Circuit should be open now
  expect(provider.circuitBreaker!.getState("/api/data")).toBe("OPEN");

  // Next request should return 503 without hitting the API
  const response = await client.getJSON("/api/data", {
    expectedStatusCodes: [503],
  });
  expect(response.status).toBe(503);
  expect(mocks.history.get.length).toBe(2); // Only 2 requests made

  mocks.restore();
});

test("FetchClientProvider - removeCircuitBreaker disables circuit breaker", async () => {
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
  expect(provider.circuitBreaker).toBeUndefined();

  // Now requests should go through (need new client)
  const client2 = provider.getFetchClient();
  const response = await client2.getJSON("/api/data", {
    expectedStatusCodes: [500],
  });
  expect(response.status).toBe(500); // Actual response, not 503

  mocks.restore();
});

test("FetchClientProvider - getFetchClient inherits provider middleware", async () => {
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

  expect(logs).toEqual(["provider"]);

  mocks.restore();
});

test("FetchClientProvider - client.use() adds to provider middleware", async () => {
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
  expect(logs).toEqual(["provider", "client"]);

  mocks.restore();
});

test("FetchClientProvider - counter is accessible", () => {
  const provider = new FetchClientProvider();

  expect(provider.counter).toBeDefined();
  expect(provider.counter.count).toBe(0);
});

test("FetchClientProvider - options getter and setter work", () => {
  const provider = new FetchClientProvider();

  const originalOptions = provider.options;
  expect(originalOptions).toBeDefined();

  provider.options = { baseUrl: "https://test.com" };
  expect(provider.options.baseUrl).toBe("https://test.com");
});

test("FetchClientProvider - usePerDomainRateLimit groups by domain", async () => {
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
  expect(r1.status).toBe(200);

  // Second request to domain1 is rate limited
  const r2 = await client.getJSON("https://domain1.com/api/other", {
    expectedStatusCodes: [429],
  });
  expect(r2.status).toBe(429);

  // First request to domain2 succeeds (different domain)
  const r3 = await client.getJSON("https://domain2.com/api/data", {
    expectedStatusCodes: [429],
  });
  expect(r3.status).toBe(200);

  mocks.restore();
});

test("FetchClientProvider - usePerDomainCircuitBreaker isolates domains", async () => {
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
  expect(r1.status).toBe(503);

  // working.com should still work (separate circuit)
  const r2 = await client.getJSON("https://working.com/api");
  expect(r2.status).toBe(200);

  mocks.restore();
});
