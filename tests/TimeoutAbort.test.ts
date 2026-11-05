import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { FetchClient } from "../src/FetchClient.ts";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

let mocks: MockRegistry;

beforeEach(() => {
  mocks = new MockRegistry();
});

afterEach(() => {
  mocks.restore();
  vi.useRealTimers();
});

test("timeout returns 408 response via FetchClient", async () => {
  mocks.onGet("/api/slow").timeout();

  const client = new FetchClient();
  mocks.install(client);

  // FetchClient catches TimeoutError and returns a 408 response
  const response = await client.getJSON("https://example.com/api/slow", {
    expectedStatusCodes: [408],
  });

  expect(response.status).toBe(408);
  expect(response.problem.title).toBe("Request Timeout");
});

test("timeout throws DOMException when using fetch directly", async () => {
  mocks.onGet("/api/slow").timeout();

  const provider = new FetchClientProvider();
  mocks.install(provider);

  // Using fetch directly throws the TimeoutError
  const request = provider.fetch!("https://example.com/api/slow");
  await expect(request).rejects.toBeInstanceOf(DOMException);
  await expect(request).rejects.toHaveProperty("name", "TimeoutError");
});

test("MockRegistry handles pre-aborted signal directly", async () => {
  mocks.onGet("/products/1").reply(200, { id: 1 });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  // Use a pre-aborted signal to test abort handling via fetch directly
  const controller = new AbortController();
  controller.abort("Signal was aborted");

  await expect(
    provider.fetch!("https://example.com/products/1", {
      signal: controller.signal,
    }),
  ).rejects.toBe("Signal was aborted");
});

test("abort signal cancels delayed response via fetch directly", async () => {
  vi.useFakeTimers();
  mocks.onGet("/products/1").delay(500).reply(200, { id: 1 });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const controller = new AbortController();
  setTimeout(() => {
    controller.abort("Signal was aborted");
  }, 50);

  const assertion = expect(
    provider.fetch!("https://example.com/products/1", {
      signal: controller.signal,
    }),
  ).rejects.toBe("Signal was aborted");

  await vi.advanceTimersByTimeAsync(50);
  await assertion;
  // The 500ms delay timer was cleared rather than left to run out
  expect(vi.getTimerCount()).toBe(0);
});

test("delayed response returns after delay", async () => {
  vi.useFakeTimers();
  mocks.onGet("/api/delayed").delay(100).reply(200, { delayed: true });

  const client = new FetchClient();
  mocks.install(client);

  const request = client.getJSON("https://example.com/api/delayed");

  await vi.advanceTimersByTimeAsync(99);
  expect(client.isLoading).toBe(true);

  await vi.advanceTimersByTimeAsync(1);
  const response = await request;

  expect(response.data).toEqual({ delayed: true });
  expect(client.isLoading).toBe(false);
});
