import { assert, expect, test } from "vite-plus/test";
import { FetchClient } from "../src/FetchClient.ts";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

test("MockRegistry - basic GET mock", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, [{ id: 1, name: "Alice" }]);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON<{ id: number; name: string }[]>(
    "https://example.com/api/users",
  );

  expect(response.status).toBe(200);
  expect(response.data).toEqual([{ id: 1, name: "Alice" }]);
});

test("MockRegistry - basic POST mock", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/api/users").reply(201, { id: 2, name: "Bob" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.postJSON<{ id: number; name: string }>(
    "https://example.com/api/users",
    { name: "Bob" },
  );

  expect(response.status).toBe(201);
  expect(response.data).toEqual({ id: 2, name: "Bob" });
});

test("MockRegistry - PUT mock", async () => {
  const mocks = new MockRegistry();
  mocks.onPut("/api/users/1").reply(200, { id: 1, name: "Updated" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.putJSON<{ id: number; name: string }>(
    "https://example.com/api/users/1",
    { name: "Updated" },
  );

  expect(response.status).toBe(200);
  expect(response.data).toEqual({ id: 1, name: "Updated" });
});

test("MockRegistry - PATCH mock", async () => {
  const mocks = new MockRegistry();
  mocks.onPatch("/api/users/1").reply(200, { id: 1, name: "Patched" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.patchJSON<{ id: number; name: string }>(
    "https://example.com/api/users/1",
    { name: "Patched" },
  );

  expect(response.status).toBe(200);
  expect(response.data).toEqual({ id: 1, name: "Patched" });
});

test("MockRegistry - DELETE mock", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/api/users/1").reply(204);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.delete("https://example.com/api/users/1");

  expect(response.status).toBe(204);
});

test("MockRegistry - onAny matches any method", async () => {
  const mocks = new MockRegistry();
  mocks.onAny("/api/anything").reply(200, { success: true });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const getResponse = await client.getJSON("https://example.com/api/anything");
  expect(getResponse.status).toBe(200);

  const postResponse = await client.postJSON("https://example.com/api/anything", {});
  expect(postResponse.status).toBe(200);
});

test("MockRegistry - regex URL matching", async () => {
  const mocks = new MockRegistry();
  mocks.onGet(/\/api\/users\/\d+/).reply(200, { id: 1, name: "User" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const response1 = await client.getJSON("https://example.com/api/users/123");
  expect(response1.status).toBe(200);

  const response2 = await client.getJSON("https://example.com/api/users/456");
  expect(response2.status).toBe(200);
});

test("MockRegistry - replyOnce removes mock after first match", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").replyOnce(200, [{ id: 1 }]);
  mocks.onGet("/api/users").reply(200, [{ id: 2 }]);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const response1 = await client.getJSON("https://example.com/api/users");
  expect(response1.data).toEqual([{ id: 1 }]);

  const response2 = await client.getJSON("https://example.com/api/users");
  expect(response2.data).toEqual([{ id: 2 }]);
});

test("MockRegistry - custom headers in response", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(
    200,
    { data: "test" },
    {
      "X-Custom-Header": "custom-value",
    },
  );

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/users");

  expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
});

test("MockRegistry - networkError throws TypeError", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/flaky").networkError("Connection refused");

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const request = client.getJSON("https://example.com/api/flaky");
  await expect(request).rejects.toThrow(TypeError);
  await expect(request).rejects.toThrow("Connection refused");
});

test("MockRegistry - timeout returns 408 response", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/slow").timeout();

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  // FetchClient catches TimeoutError and returns a 408 response
  const response = await client.getJSON("https://example.com/api/slow", {
    expectedStatusCodes: [408],
  });

  expect(response.status).toBe(408);
  expect(response.problem.title).toBe("Request Timeout");
});

test("MockRegistry - timeout throws when using fetch directly", async () => {
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
    expect(e.name).toBe("TimeoutError");
  }
});

test("MockRegistry - delay response", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/delayed").delay(50).reply(200, { delayed: true });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const start = Date.now();
  const response = await client.getJSON("https://example.com/api/delayed");
  const elapsed = Date.now() - start;
  const minimumExpectedDelayMs = 45;

  expect(response.data).toEqual({ delayed: true });
  expect(
    elapsed,
    `Expected delay of at least ${minimumExpectedDelayMs}ms, got ${elapsed}ms`,
  ).toBeGreaterThanOrEqual(minimumExpectedDelayMs);
});

test("MockRegistry - withHeaders conditional matching", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").withHeaders({ "X-Admin": "true" }).reply(200, { admin: true });
  mocks.onGet("/api/users").reply(200, { admin: false });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  // Use fetch directly to test header matching without FetchClient's header merging
  const adminResponse = await provider.fetch!("https://example.com/api/users", {
    headers: { "X-Admin": "true" },
  });
  const adminData = await adminResponse.json();
  expect(adminData).toEqual({ admin: true });

  const normalResponse = await provider.fetch!("https://example.com/api/users");
  const normalData = await normalResponse.json();
  expect(normalData).toEqual({ admin: false });
});

test("MockRegistry - history records requests", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);
  mocks.onPost("/api/users").reply(201, {});

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  await client.getJSON("https://example.com/api/users");
  await client.postJSON("https://example.com/api/users", { name: "Test" });
  await client.getJSON("https://example.com/api/users");

  expect(mocks.history.get.length).toBe(2);
  expect(mocks.history.post.length).toBe(1);
  expect(mocks.history.all.length).toBe(3);
});

test("MockRegistry - reset clears mocks and history", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/users");

  expect(mocks.history.all.length).toBe(1);

  mocks.reset();

  expect(mocks.history.all.length).toBe(0);
});

test("MockRegistry - resetMocks keeps history", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/users");

  mocks.resetMocks();

  expect(mocks.history.all.length).toBe(1);
});

test("MockRegistry - resetHistory keeps mocks", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, [{ id: 1 }]);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/users");

  mocks.resetHistory();

  expect(mocks.history.all.length).toBe(0);

  // Mock should still work
  const response = await client.getJSON("https://example.com/api/users");
  expect(response.data).toEqual([{ id: 1 }]);
});

test("MockRegistry - install on FetchClient uses provider", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, [{ id: 1 }]);

  const client = new FetchClient();
  mocks.install(client);

  const response = await client.getJSON("https://example.com/api/users");
  expect(response.data).toEqual([{ id: 1 }]);
});

test("MockRegistry - throws if already installed", () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const provider2 = new FetchClientProvider();

  try {
    mocks.install(provider2);
    throw new Error("Should have thrown");
  } catch (e) {
    expect((e as Error).message).toBe("MockRegistry is already installed. Call restore() first.");
  }

  mocks.restore();
});

test("MockRegistry - restore is idempotent", () => {
  const mocks = new MockRegistry();
  const provider = new FetchClientProvider();
  mocks.install(provider);

  mocks.restore();
  mocks.restore(); // Should not throw
});

test("MockRegistry - chaining multiple mocks", async () => {
  const mocks = new MockRegistry();
  mocks
    .onGet("/api/users")
    .reply(200, [{ id: 1 }])
    .onPost("/api/users")
    .reply(201, { id: 2 })
    .onDelete("/api/users/1")
    .reply(204);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const getResponse = await client.getJSON("https://example.com/api/users");
  expect(getResponse.status).toBe(200);

  const postResponse = await client.postJSON("https://example.com/api/users", {});
  expect(postResponse.status).toBe(201);

  const deleteResponse = await client.delete("https://example.com/api/users/1");
  expect(deleteResponse.status).toBe(204);
});

test("MockRegistry - works with baseUrl", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, [{ id: 1 }]);

  const provider = new FetchClientProvider();
  provider.setBaseUrl("https://api.example.com");
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("/users");

  expect(response.status).toBe(200);
  expect(response.data).toEqual([{ id: 1 }]);
});

test("MockRegistry - no data returns null body", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/api/users/1").reply(204);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.delete("https://example.com/api/users/1");

  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
});

test("MockRegistry - fetch getter for standalone use", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 42 });
  mocks.onPost("/api/data").reply(201, { created: true });

  // Use mocks.fetch directly without installing
  const getResponse = await mocks.fetch("https://example.com/api/data");
  expect(getResponse.status).toBe(200);
  expect(await getResponse.json()).toEqual({ value: 42 });

  const postResponse = await mocks.fetch("https://example.com/api/data", {
    method: "POST",
    body: JSON.stringify({ input: "test" }),
  });
  expect(postResponse.status).toBe(201);
  expect(await postResponse.json()).toEqual({ created: true });

  // History should still be recorded
  expect(mocks.history.all.length).toBe(2);
  expect(mocks.history.get.length).toBe(1);
  expect(mocks.history.post.length).toBe(1);
});
