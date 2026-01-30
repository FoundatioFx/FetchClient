import { assert, assertEquals, assertRejects } from "@std/assert";
import { FetchClient } from "../FetchClient.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

Deno.test("MockRegistry - basic GET mock", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, [{ id: 1, name: "Alice" }]);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON<{ id: number; name: string }[]>(
    "https://example.com/api/users",
  );

  assertEquals(response.status, 200);
  assertEquals(response.data, [{ id: 1, name: "Alice" }]);
});

Deno.test("MockRegistry - basic POST mock", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/api/users").reply(201, { id: 2, name: "Bob" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.postJSON<{ id: number; name: string }>(
    "https://example.com/api/users",
    { name: "Bob" },
  );

  assertEquals(response.status, 201);
  assertEquals(response.data, { id: 2, name: "Bob" });
});

Deno.test("MockRegistry - PUT mock", async () => {
  const mocks = new MockRegistry();
  mocks.onPut("/api/users/1").reply(200, { id: 1, name: "Updated" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.putJSON<{ id: number; name: string }>(
    "https://example.com/api/users/1",
    { name: "Updated" },
  );

  assertEquals(response.status, 200);
  assertEquals(response.data, { id: 1, name: "Updated" });
});

Deno.test("MockRegistry - PATCH mock", async () => {
  const mocks = new MockRegistry();
  mocks.onPatch("/api/users/1").reply(200, { id: 1, name: "Patched" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.patchJSON<{ id: number; name: string }>(
    "https://example.com/api/users/1",
    { name: "Patched" },
  );

  assertEquals(response.status, 200);
  assertEquals(response.data, { id: 1, name: "Patched" });
});

Deno.test("MockRegistry - DELETE mock", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/api/users/1").reply(204);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.delete("https://example.com/api/users/1");

  assertEquals(response.status, 204);
});

Deno.test("MockRegistry - onAny matches any method", async () => {
  const mocks = new MockRegistry();
  mocks.onAny("/api/anything").reply(200, { success: true });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const getResponse = await client.getJSON("https://example.com/api/anything");
  assertEquals(getResponse.status, 200);

  const postResponse = await client.postJSON(
    "https://example.com/api/anything",
    {},
  );
  assertEquals(postResponse.status, 200);
});

Deno.test("MockRegistry - regex URL matching", async () => {
  const mocks = new MockRegistry();
  mocks.onGet(/\/api\/users\/\d+/).reply(200, { id: 1, name: "User" });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const response1 = await client.getJSON("https://example.com/api/users/123");
  assertEquals(response1.status, 200);

  const response2 = await client.getJSON("https://example.com/api/users/456");
  assertEquals(response2.status, 200);
});

Deno.test("MockRegistry - replyOnce removes mock after first match", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").replyOnce(200, [{ id: 1 }]);
  mocks.onGet("/api/users").reply(200, [{ id: 2 }]);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const response1 = await client.getJSON("https://example.com/api/users");
  assertEquals(response1.data, [{ id: 1 }]);

  const response2 = await client.getJSON("https://example.com/api/users");
  assertEquals(response2.data, [{ id: 2 }]);
});

Deno.test("MockRegistry - custom headers in response", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, { data: "test" }, {
    "X-Custom-Header": "custom-value",
  });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("https://example.com/api/users");

  assertEquals(response.headers.get("X-Custom-Header"), "custom-value");
});

Deno.test("MockRegistry - networkError throws TypeError", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/flaky").networkError("Connection refused");

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  await assertRejects(
    () => client.getJSON("https://example.com/api/flaky"),
    TypeError,
    "Connection refused",
  );
});

Deno.test("MockRegistry - timeout returns 408 response", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/slow").timeout();

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  // FetchClient catches TimeoutError and returns a 408 response
  const response = await client.getJSON("https://example.com/api/slow", {
    expectedStatusCodes: [408],
  });

  assertEquals(response.status, 408);
  assertEquals(response.problem.title, "Request Timeout");
});

Deno.test("MockRegistry - timeout throws when using fetch directly", async () => {
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

Deno.test("MockRegistry - delay response", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/delayed").delay(50).reply(200, { delayed: true });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const start = Date.now();
  const response = await client.getJSON("https://example.com/api/delayed");
  const elapsed = Date.now() - start;

  assertEquals(response.data, { delayed: true });
  assert(elapsed >= 50, `Expected delay of at least 50ms, got ${elapsed}ms`);
});

Deno.test("MockRegistry - withHeaders conditional matching", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users")
    .withHeaders({ "X-Admin": "true" })
    .reply(200, { admin: true });
  mocks.onGet("/api/users").reply(200, { admin: false });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  // Use fetch directly to test header matching without FetchClient's header merging
  const adminResponse = await provider.fetch!(
    "https://example.com/api/users",
    { headers: { "X-Admin": "true" } },
  );
  const adminData = await adminResponse.json();
  assertEquals(adminData, { admin: true });

  const normalResponse = await provider.fetch!("https://example.com/api/users");
  const normalData = await normalResponse.json();
  assertEquals(normalData, { admin: false });
});

Deno.test("MockRegistry - history records requests", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);
  mocks.onPost("/api/users").reply(201, {});

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  await client.getJSON("https://example.com/api/users");
  await client.postJSON("https://example.com/api/users", { name: "Test" });
  await client.getJSON("https://example.com/api/users");

  assertEquals(mocks.history.get.length, 2);
  assertEquals(mocks.history.post.length, 1);
  assertEquals(mocks.history.all.length, 3);
});

Deno.test("MockRegistry - reset clears mocks and history", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/users");

  assertEquals(mocks.history.all.length, 1);

  mocks.reset();

  assertEquals(mocks.history.all.length, 0);
});

Deno.test("MockRegistry - resetMocks keeps history", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/users");

  mocks.resetMocks();

  assertEquals(mocks.history.all.length, 1);
});

Deno.test("MockRegistry - resetHistory keeps mocks", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, [{ id: 1 }]);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  await client.getJSON("https://example.com/api/users");

  mocks.resetHistory();

  assertEquals(mocks.history.all.length, 0);

  // Mock should still work
  const response = await client.getJSON("https://example.com/api/users");
  assertEquals(response.data, [{ id: 1 }]);
});

Deno.test("MockRegistry - install on FetchClient uses provider", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, [{ id: 1 }]);

  const client = new FetchClient();
  mocks.install(client);

  const response = await client.getJSON("https://example.com/api/users");
  assertEquals(response.data, [{ id: 1 }]);
});

Deno.test("MockRegistry - throws if already installed", () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, []);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const provider2 = new FetchClientProvider();

  try {
    mocks.install(provider2);
    throw new Error("Should have thrown");
  } catch (e) {
    assertEquals(
      (e as Error).message,
      "MockRegistry is already installed. Call restore() first.",
    );
  }

  mocks.restore();
});

Deno.test("MockRegistry - restore is idempotent", () => {
  const mocks = new MockRegistry();
  const provider = new FetchClientProvider();
  mocks.install(provider);

  mocks.restore();
  mocks.restore(); // Should not throw
});

Deno.test("MockRegistry - chaining multiple mocks", async () => {
  const mocks = new MockRegistry();
  mocks
    .onGet("/api/users").reply(200, [{ id: 1 }])
    .onPost("/api/users").reply(201, { id: 2 })
    .onDelete("/api/users/1").reply(204);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  const getResponse = await client.getJSON("https://example.com/api/users");
  assertEquals(getResponse.status, 200);

  const postResponse = await client.postJSON(
    "https://example.com/api/users",
    {},
  );
  assertEquals(postResponse.status, 201);

  const deleteResponse = await client.delete(
    "https://example.com/api/users/1",
  );
  assertEquals(deleteResponse.status, 204);
});

Deno.test("MockRegistry - works with baseUrl", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, [{ id: 1 }]);

  const provider = new FetchClientProvider();
  provider.setBaseUrl("https://api.example.com");
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.getJSON("/users");

  assertEquals(response.status, 200);
  assertEquals(response.data, [{ id: 1 }]);
});

Deno.test("MockRegistry - no data returns null body", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/api/users/1").reply(204);

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();
  const response = await client.delete("https://example.com/api/users/1");

  assertEquals(response.status, 204);
  assertEquals(await response.text(), "");
});

Deno.test("MockRegistry - fetch getter for standalone use", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: 42 });
  mocks.onPost("/api/data").reply(201, { created: true });

  // Use mocks.fetch directly without installing
  const getResponse = await mocks.fetch("https://example.com/api/data");
  assertEquals(getResponse.status, 200);
  assertEquals(await getResponse.json(), { value: 42 });

  const postResponse = await mocks.fetch("https://example.com/api/data", {
    method: "POST",
    body: JSON.stringify({ input: "test" }),
  });
  assertEquals(postResponse.status, 201);
  assertEquals(await postResponse.json(), { created: true });

  // History should still be recorded
  assertEquals(mocks.history.all.length, 2);
  assertEquals(mocks.history.get.length, 1);
  assertEquals(mocks.history.post.length, 1);
});
