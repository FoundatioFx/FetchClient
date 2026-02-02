import { assert, assertEquals } from "@std/assert";
import { FetchClient } from "../FetchClient.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";
import { createRetryMiddleware, RetryMiddleware } from "../RetryMiddleware.ts";

Deno.test("RetryMiddleware - does not retry on success", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { success: true });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data");

  assertEquals(response.status, 200);
  assertEquals(mocks.history.all.length, 1);
});

Deno.test("RetryMiddleware - retries on 500 status", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(500, { error: "Internal Server Error" });
  mocks.onGet("/api/data").reply(200, { success: true });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  assertEquals(response.status, 200);
  assertEquals(mocks.history.all.length, 2);
});

Deno.test("RetryMiddleware - retries on 429 status", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(429, { error: "Too Many Requests" });
  mocks.onGet("/api/data").reply(200, { success: true });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [429],
  });

  assertEquals(response.status, 200);
  assertEquals(mocks.history.all.length, 2);
});

Deno.test("RetryMiddleware - respects retry limit", async () => {
  const mocks = new MockRegistry();
  // All requests return 500
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 2, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // Should have made 3 total attempts (initial + 2 retries)
  assertEquals(response.status, 500);
  assertEquals(mocks.history.all.length, 3);
});

Deno.test("RetryMiddleware - does not retry non-idempotent methods by default", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.postJSON("https://example.com/api/data", {
    name: "test",
  }, {
    expectedStatusCodes: [500],
  });

  // POST should not be retried by default
  assertEquals(response.status, 500);
  assertEquals(mocks.history.all.length, 1);
});

Deno.test("RetryMiddleware - can configure retryable methods to exclude GET", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    methods: ["HEAD"], // Only retry HEAD, not GET
    jitter: 0,
    delay: () => 10,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // GET should NOT be retried since we only configured HEAD
  assertEquals(response.status, 500);
  assertEquals(mocks.history.all.length, 1);
});

Deno.test("RetryMiddleware - respects Retry-After header in seconds", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(429, { error: "Too Many Requests" }, {
    "Retry-After": "1",
  });
  mocks.onGet("/api/data").reply(200, { success: true });

  const startTime = Date.now();

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3, jitter: 0 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [429],
  });

  const elapsedTime = Date.now() - startTime;

  assertEquals(response.status, 200);
  assertEquals(mocks.history.all.length, 2);
  // Should have waited at least 1 second (1000ms) for Retry-After
  assert(
    elapsedTime >= 900,
    `Expected at least 900ms delay, got ${elapsedTime}ms`,
  );
});

Deno.test("RetryMiddleware - does not retry when Retry-After exceeds maxRetryAfter", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(429, { error: "Too Many Requests" }, {
    "Retry-After": "60", // 60 seconds
  });

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    maxRetryAfter: 1000, // Only wait up to 1 second
    jitter: 0,
    delay: () => 10,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [429],
  });

  // Should not retry because Retry-After exceeds maxRetryAfter
  assertEquals(response.status, 429);
  assertEquals(mocks.history.all.length, 1);
});

Deno.test("RetryMiddleware - applies exponential backoff", async () => {
  const delays: number[] = [];

  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    jitter: 0,
    delay: (attempt) => {
      const delay = 10 * Math.pow(2, attempt);
      delays.push(delay);
      return delay;
    },
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // Check exponential backoff pattern
  assertEquals(delays.length, 3);
  assertEquals(delays[0], 10); // 10 * 2^0
  assertEquals(delays[1], 20); // 10 * 2^1
  assertEquals(delays[2], 40); // 10 * 2^2
});

Deno.test("RetryMiddleware - custom shouldRetry predicate", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(500, { error: "Internal Server Error" });
  mocks.onGet("/api/data").reply(200, { success: true });

  let shouldRetryCalled = false;

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    jitter: 0,
    delay: () => 10,
    shouldRetry: (response, _attemptNumber) => {
      shouldRetryCalled = true;
      // Only retry if error is retryable
      return response.status === 500;
    },
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  assert(shouldRetryCalled);
  assertEquals(response.status, 200);
  assertEquals(mocks.history.all.length, 2);
});

Deno.test("RetryMiddleware - shouldRetry can prevent retry", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    jitter: 0,
    delay: () => 10,
    shouldRetry: () => false, // Never retry
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  assertEquals(response.status, 500);
  assertEquals(mocks.history.all.length, 1);
});

Deno.test("RetryMiddleware - onRetry callback is called", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(500, { error: "Internal Server Error" });
  mocks.onGet("/api/data").replyOnce(502, { error: "Bad Gateway" });
  mocks.onGet("/api/data").reply(200, { success: true });

  const retryInfo: { attempt: number; status: number; delay: number }[] = [];

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    jitter: 0,
    delay: () => 10,
    onRetry: (attempt, response, delay) => {
      retryInfo.push({ attempt, status: response.status, delay });
    },
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500, 502],
  });

  assertEquals(response.status, 200);
  assertEquals(retryInfo.length, 2);
  assertEquals(retryInfo[0].attempt, 0);
  assertEquals(retryInfo[0].status, 500);
  assertEquals(retryInfo[1].attempt, 1);
  assertEquals(retryInfo[1].status, 502);
});

Deno.test("RetryMiddleware - backoffLimit caps exponential delay", async () => {
  const delays: number[] = [];

  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 5,
    jitter: 0,
    backoffLimit: 100,
    onRetry: (_attempt, _response, delay) => {
      delays.push(delay);
    },
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // All delays should be capped at backoffLimit
  for (const delay of delays) {
    assert(delay <= 100, `Delay ${delay} exceeds backoffLimit`);
  }
});

Deno.test("RetryMiddleware - retry count stored in context", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(500, { error: "Internal Server Error" });
  mocks.onGet("/api/data").replyOnce(500, { error: "Internal Server Error" });
  mocks.onGet("/api/data").reply(200, { success: true });

  const retryAttempts: (number | undefined)[] = [];

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    jitter: 0,
    delay: () => 10,
  });
  // Add middleware after retry to observe retry count
  provider.useMiddleware(async (ctx, next) => {
    await next();
    retryAttempts.push(ctx.retryAttempt as number | undefined);
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // First attempt has no retryAttempt, subsequent ones have it
  assertEquals(retryAttempts.length, 3);
  assertEquals(retryAttempts[0], undefined);
  assertEquals(retryAttempts[1], 1);
  assertEquals(retryAttempts[2], 2);
});

Deno.test("RetryMiddleware - HEAD method is retried by default", async () => {
  const mocks = new MockRegistry();
  mocks.onHead("/api/data").replyOnce(503);
  mocks.onHead("/api/data").reply(200);

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 2, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.head("https://example.com/api/data", {
    expectedStatusCodes: [503],
  });

  assertEquals(response.status, 200);
  assertEquals(mocks.history.head.length, 2);
});

Deno.test("RetryMiddleware - does not retry on 4xx status by default", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(404, { error: "Not Found" });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [404],
  });

  // 404 should not be retried (not in default statusCodes)
  assertEquals(response.status, 404);
  assertEquals(mocks.history.all.length, 1);
});

Deno.test("RetryMiddleware - can configure retryable status codes", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(404, { error: "Not Found" });
  mocks.onGet("/api/data").reply(200, { success: true });

  const provider = new FetchClientProvider();
  provider.useRetry({
    limit: 3,
    statusCodes: [404],
    jitter: 0,
    delay: () => 10,
  });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [404],
  });

  assertEquals(response.status, 200);
  assertEquals(mocks.history.all.length, 2);
});

Deno.test("createRetryMiddleware - can be used with client.use()", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(500, { error: "Internal Server Error" });
  mocks.onGet("/api/data").reply(200, { success: true });

  const client = new FetchClient();
  client.use(createRetryMiddleware({ limit: 3, jitter: 0, delay: () => 10 }));
  mocks.install(client);

  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  assertEquals(response.status, 200);
  assertEquals(mocks.history.all.length, 2);
});

Deno.test("RetryMiddleware - removeRetry removes the middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3, jitter: 0, delay: () => 10 });
  provider.removeRetry();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  // Should not retry after removeRetry()
  assertEquals(response.status, 500);
  assertEquals(mocks.history.all.length, 1);
});

Deno.test("RetryMiddleware class - can be instantiated directly", () => {
  const middleware = new RetryMiddleware({
    limit: 5,
    methods: ["GET", "POST"],
    statusCodes: [500, 502, 503],
  });

  const fn = middleware.middleware();
  assertEquals(typeof fn, "function");
});
