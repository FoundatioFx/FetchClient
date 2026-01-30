import { assert, assertEquals } from "@std/assert";
import { FetchClient } from "../FetchClient.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

Deno.test("timeout returns 408 response via FetchClient", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/slow").timeout();

  const client = new FetchClient();
  mocks.install(client);

  // FetchClient catches TimeoutError and returns a 408 response
  const response = await client.getJSON("https://example.com/api/slow", {
    expectedStatusCodes: [408],
  });

  assertEquals(response.status, 408);
  assertEquals(response.problem.title, "Request Timeout");
});

Deno.test("timeout throws DOMException when using fetch directly", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/slow").timeout();

  const provider = new FetchClientProvider();
  mocks.install(provider);

  // Using fetch directly throws the TimeoutError
  try {
    await provider.fetch!("https://example.com/api/slow");
    throw new Error("Should have thrown");
  } catch (e) {
    assert(e instanceof DOMException);
    assertEquals(e.name, "TimeoutError");
  }
});

Deno.test("MockRegistry handles pre-aborted signal directly", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/products/1").reply(200, { id: 1 });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  // Use a pre-aborted signal to test abort handling via fetch directly
  const controller = new AbortController();
  controller.abort("Signal was aborted");

  let gotError = false;
  try {
    await provider.fetch!("https://example.com/products/1", {
      signal: controller.signal,
    });
  } catch (error) {
    assertEquals(error, "Signal was aborted");
    gotError = true;
  }

  assert(gotError);
});

Deno.test("abort signal cancels delayed response via fetch directly", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/products/1").delay(500).reply(200, { id: 1 });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const controller = new AbortController();
  setTimeout(() => {
    controller.abort("Signal was aborted");
  }, 50);

  let gotError = false;
  const start = Date.now();
  try {
    await provider.fetch!("https://example.com/products/1", {
      signal: controller.signal,
    });
  } catch (error) {
    assertEquals(error, "Signal was aborted");
    gotError = true;
  }
  const elapsed = Date.now() - start;

  assert(gotError);
  // Should abort after ~50ms, not wait for the full 500ms delay
  assert(elapsed < 200, `Expected abort after ~50ms, but took ${elapsed}ms`);
});

Deno.test("delayed response returns after delay", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/delayed").delay(100).reply(200, { delayed: true });

  const client = new FetchClient();
  mocks.install(client);

  const start = Date.now();
  const response = await client.getJSON("https://example.com/api/delayed");
  const elapsed = Date.now() - start;

  assertEquals(response.data, { delayed: true });
  assert(elapsed >= 100, `Expected delay of at least 100ms, got ${elapsed}ms`);
});
