import { expect, test } from "vite-plus/test";
import { FetchClient } from "../src/FetchClient.ts";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";
import { createRetryMiddleware, RetryMiddleware } from "../src/RetryMiddleware.ts";

test("RetryMiddleware - does not retry on success", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { success: true });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/data");

  expect(response.status).toBe(200);
  expect(mocks.history.all.length).toBe(1);
});

test("RetryMiddleware - retries on 500 status", async () => {
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

  expect(response.status).toBe(200);
  expect(mocks.history.all.length).toBe(2);
});

test("RetryMiddleware - retries on 429 status", async () => {
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

  expect(response.status).toBe(200);
  expect(mocks.history.all.length).toBe(2);
});

test("RetryMiddleware - respects retry limit", async () => {
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
  expect(response.status).toBe(500);
  expect(mocks.history.all.length).toBe(3);
});

test("RetryMiddleware - does not retry non-idempotent methods by default", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/api/data").reply(500, { error: "Internal Server Error" });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 3, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.postJSON(
    "https://example.com/api/data",
    {
      name: "test",
    },
    {
      expectedStatusCodes: [500],
    },
  );

  // POST should not be retried by default
  expect(response.status).toBe(500);
  expect(mocks.history.all.length).toBe(1);
});

test("RetryMiddleware - can configure retryable methods to exclude GET", async () => {
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
  expect(response.status).toBe(500);
  expect(mocks.history.all.length).toBe(1);
});

test("RetryMiddleware - respects Retry-After header in seconds", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(
    429,
    { error: "Too Many Requests" },
    {
      "Retry-After": "1",
    },
  );
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

  expect(response.status).toBe(200);
  expect(mocks.history.all.length).toBe(2);
  // Should have waited at least 1 second (1000ms) for Retry-After
  expect(elapsedTime, `Expected at least 900ms delay, got ${elapsedTime}ms`).toBeGreaterThanOrEqual(
    900,
  );
});

test("RetryMiddleware - does not retry when Retry-After exceeds maxRetryAfter", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(
    429,
    { error: "Too Many Requests" },
    {
      "Retry-After": "60", // 60 seconds
    },
  );

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
  expect(response.status).toBe(429);
  expect(mocks.history.all.length).toBe(1);
});

test("RetryMiddleware - applies exponential backoff", async () => {
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
  expect(delays.length).toBe(3);
  expect(delays[0]).toBe(10); // 10 * 2^0
  expect(delays[1]).toBe(20); // 10 * 2^1
  expect(delays[2]).toBe(40); // 10 * 2^2
});

test("RetryMiddleware - custom shouldRetry predicate", async () => {
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

  expect(shouldRetryCalled).toBe(true);
  expect(response.status).toBe(200);
  expect(mocks.history.all.length).toBe(2);
});

test("RetryMiddleware - shouldRetry can prevent retry", async () => {
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

  expect(response.status).toBe(500);
  expect(mocks.history.all.length).toBe(1);
});

test("RetryMiddleware - onRetry callback is called", async () => {
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

  expect(response.status).toBe(200);
  expect(retryInfo.length).toBe(2);
  expect(retryInfo[0].attempt).toBe(0);
  expect(retryInfo[0].status).toBe(500);
  expect(retryInfo[1].attempt).toBe(1);
  expect(retryInfo[1].status).toBe(502);
});

test("RetryMiddleware - backoffLimit caps exponential delay", async () => {
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
    expect(delay, `Delay ${delay} exceeds backoffLimit`).toBeLessThanOrEqual(100);
  }
});

test("RetryMiddleware - retry count stored in context", async () => {
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
  expect(retryAttempts.length).toBe(3);
  expect(retryAttempts[0]).toBeUndefined();
  expect(retryAttempts[1]).toBe(1);
  expect(retryAttempts[2]).toBe(2);
});

test("RetryMiddleware - HEAD method is retried by default", async () => {
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

  expect(response.status).toBe(200);
  expect(mocks.history.head.length).toBe(2);
});

test("RetryMiddleware - QUERY method is retried by default", async () => {
  const mocks = new MockRegistry();
  mocks.onQuery("/api/search").replyOnce(503, { error: "Unavailable" });
  mocks.onQuery("/api/search").reply(200, { results: [1] });

  const provider = new FetchClientProvider();
  provider.useRetry({ limit: 2, jitter: 0, delay: () => 10 });
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.queryJSON<{ results: number[] }>(
    "https://example.com/api/search",
    { term: "test" },
    { expectedStatusCodes: [503] },
  );

  expect(response.status).toBe(200);
  expect(response.data).toEqual({ results: [1] });
  expect(mocks.history.query.length).toBe(2);
});

test("RetryMiddleware - does not retry on 4xx status by default", async () => {
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
  expect(response.status).toBe(404);
  expect(mocks.history.all.length).toBe(1);
});

test("RetryMiddleware - can configure retryable status codes", async () => {
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

  expect(response.status).toBe(200);
  expect(mocks.history.all.length).toBe(2);
});

test("createRetryMiddleware - can be used with client.use()", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").replyOnce(500, { error: "Internal Server Error" });
  mocks.onGet("/api/data").reply(200, { success: true });

  const client = new FetchClient();
  client.use(createRetryMiddleware({ limit: 3, jitter: 0, delay: () => 10 }));
  mocks.install(client);

  const response = await client.getJSON("https://example.com/api/data", {
    expectedStatusCodes: [500],
  });

  expect(response.status).toBe(200);
  expect(mocks.history.all.length).toBe(2);
});

test("RetryMiddleware - removeRetry removes the middleware", async () => {
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
  expect(response.status).toBe(500);
  expect(mocks.history.all.length).toBe(1);
});

test("RetryMiddleware class - can be instantiated directly", () => {
  const middleware = new RetryMiddleware({
    limit: 5,
    methods: ["GET", "POST"],
    statusCodes: [500, 502, 503],
  });

  const fn = middleware.middleware();
  expect(typeof fn).toBe("function");
});
