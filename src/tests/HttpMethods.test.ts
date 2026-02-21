import { assert, assertEquals, assertFalse } from "@std/assert";
import { FetchClient } from "../FetchClient.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

type Todo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

Deno.test("can getJSON with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
  });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  let called = false;
  provider.useMiddleware(async (ctx, next) => {
    assert(ctx);
    assert(ctx.request);
    assert(ctx.options.expectedStatusCodes);
    assert(ctx.options.expectedStatusCodes.length > 0);
    assertFalse(ctx.response);
    assert(provider.isLoading);
    called = true;
    await next();
    assert(ctx.response);
  });

  const client = provider.getFetchClient();
  const r = await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      expectedStatusCodes: [404],
    },
  );

  assert(r.ok);
  assertEquals(r.status, 200);
  assert(r.data);
  assert(called);
  assertEquals(r.data!.userId, 1);
  assertEquals(r.data!.id, 1);
  assertEquals(r.data!.title, "A random title");
  assertFalse(r.data!.completed);
  assertFalse(provider.isLoading);
});

Deno.test("can postJSON with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
  });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.use(async (ctx, next) => {
    assert(ctx);
    assert(ctx.request);
    assert(ctx.options);
    assertFalse(ctx.response);
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.postJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
  );
  assert(r.ok);
  assertEquals(r.status, 200);
  assert(r.data);
  assert(called);
  assertEquals(r.data!.userId, 1);
  assertEquals(r.data!.id, 1);
  assertEquals(r.data!.title, "A random title");
  assertEquals(r.data!.completed, false);
});

Deno.test("can putJSON with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onPut("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
  });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.use(async (ctx, next) => {
    assert(ctx);
    assert(ctx.request);
    assertFalse(ctx.response);
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.putJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
  );
  assert(r.ok);
  assertEquals(r.status, 200);
  assert(r.data);
  assert(called);
  assertEquals(r.data!.userId, 1);
  assertEquals(r.data!.id, 1);
  assertEquals(r.data!.title, "A random title");
  assertEquals(r.data!.completed, false);
});

Deno.test("can patchJSON with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onPatch("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "Updated title",
    completed: true,
  });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.use(async (ctx, next) => {
    assert(ctx);
    assert(ctx.request);
    assertFalse(ctx.response);
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.patchJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    { completed: true },
  );
  assert(r.ok);
  assertEquals(r.status, 200);
  assert(r.data);
  assert(called);
  assertEquals(r.data!.title, "Updated title");
  assertEquals(r.data!.completed, true);
});

Deno.test("can deleteJSON with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
  });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.use(async (ctx, next) => {
    assert(ctx);
    assert(ctx.request);
    assertFalse(ctx.response);
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.deleteJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
  );
  assert(r.ok);
  assertEquals(r.status, 200);
  assert(r.data);
  assert(called);
  assertEquals(r.data!.userId, 1);
  assertEquals(r.data!.id, 1);
  assertEquals(r.data!.title, "A random title");
  assertEquals(r.data!.completed, false);
});

Deno.test("json helpers preserve defaultRequestOptions headers", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/get").reply(200, { ok: true });
  mocks.onPost("/todos/post").reply(200, { ok: true });
  mocks.onPut("/todos/put").reply(200, { ok: true });
  mocks.onPatch("/todos/patch").reply(200, { ok: true });
  mocks.onDelete("/todos/delete").reply(200, { ok: true });

  const client = new FetchClient({
    defaultRequestOptions: {
      headers: {
        "X-Requested-By": "my-app",
      },
    },
  });
  mocks.install(client);

  await client.getJSON("https://example.com/todos/get", {
    headers: {
      "X-Trace": "get",
    },
  });
  await client.postJSON("https://example.com/todos/post", { id: 1 }, {
    headers: {
      "X-Trace": "post",
    },
  });
  await client.putJSON("https://example.com/todos/put", { id: 1 }, {
    headers: {
      "X-Trace": "put",
    },
  });
  await client.patchJSON("https://example.com/todos/patch", { id: 1 }, {
    headers: {
      "X-Trace": "patch",
    },
  });
  await client.deleteJSON("https://example.com/todos/delete", {
    headers: {
      "X-Trace": "delete",
    },
  });

  for (const request of mocks.history.all) {
    assertEquals(request.headers.get("X-Requested-By"), "my-app");
    assertEquals(
      request.headers.get("Accept"),
      "application/json, application/problem+json",
    );
    assert(request.headers.get("X-Trace"));
  }
});

Deno.test("can delete with 204 no content", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/todos/1").reply(204);

  const client = new FetchClient();
  mocks.install(client);

  const r = await client.delete("https://example.com/todos/1");

  assertEquals(r.status, 204);
  assertEquals(await r.text(), "");
});

Deno.test("can get loading status", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").delay(10).reply(200, { id: 1 });

  const client = new FetchClient();
  mocks.install(client);

  const response = client.getJSON("https://example.com/todos/1");
  assert(client.isLoading);

  await response;
  assertFalse(client.isLoading);
});

Deno.test("can use loading event", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").delay(10).reply(200, { id: 1 });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.loading.on((_isLoading) => {
    called = true;
  });

  const response = client.getJSON("https://example.com/todos/1");
  assert(client.isLoading);

  await response;
  assert(called);
  assertFalse(client.isLoading);
});

Deno.test("request history is recorded", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, []);
  mocks.onPost("/users").reply(201, { id: 1 });

  const client = new FetchClient();
  mocks.install(client);

  await client.getJSON("https://example.com/users");
  await client.postJSON("https://example.com/users", { name: "Test" });
  await client.getJSON("https://example.com/users");

  assertEquals(mocks.history.get.length, 2);
  assertEquals(mocks.history.post.length, 1);
  assertEquals(mocks.history.all.length, 3);
});

Deno.test("can head with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onHead("/todos/1").reply(200, null, {
    "Content-Length": "1234",
    "Content-Type": "application/json",
  });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.use(async (ctx, next) => {
    assert(ctx);
    assert(ctx.request);
    assertEquals(ctx.request.method, "HEAD");
    assertFalse(ctx.response);
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.head("https://jsonplaceholder.typicode.com/todos/1");
  assert(r.ok);
  assertEquals(r.status, 200);
  assert(called);
  assertEquals(r.headers.get("Content-Length"), "1234");
});

Deno.test("head request history is recorded", async () => {
  const mocks = new MockRegistry();
  mocks.onHead("/users").reply(200);
  mocks.onGet("/users").reply(200, []);

  const client = new FetchClient();
  mocks.install(client);

  await client.head("https://example.com/users");
  await client.getJSON("https://example.com/users");
  await client.head("https://example.com/users");

  assertEquals(mocks.history.head.length, 2);
  assertEquals(mocks.history.get.length, 1);
  assertEquals(mocks.history.all.length, 3);
});

Deno.test("can use .json<T>() helper on get()", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/users/1").reply(200, {
    id: 1,
    name: "John Doe",
    email: "john@example.com",
  });

  const client = new FetchClient();
  mocks.install(client);

  // Use the new fluent API with typed json() helper
  const user = await client
    .get("https://example.com/users/1", {
      headers: { Accept: "application/json" },
    })
    .json<{ id: number; name: string; email: string }>();

  assertEquals(user.id, 1);
  assertEquals(user.name, "John Doe");
  assertEquals(user.email, "john@example.com");
});

Deno.test("can use .json<T>() helper on post()", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/users").reply(201, {
    id: 42,
    name: "Jane Smith",
  });

  const client = new FetchClient();
  mocks.install(client);

  // Use the new fluent API with typed json() helper
  const created = await client
    .post(
      "https://example.com/users",
      { name: "Jane Smith" },
      { headers: { Accept: "application/json" } },
    )
    .json<{ id: number; name: string }>();

  assertEquals(created.id, 42);
  assertEquals(created.name, "Jane Smith");
});

Deno.test("can use .text() helper on get()", async () => {
  const mocks = new MockRegistry();
  // MockRegistry JSON-encodes bodies by default, so we pass an object
  // and verify we get the JSON-stringified version via .text()
  mocks.onGet("/api/info").reply(200, { message: "hello" });

  const client = new FetchClient();
  mocks.install(client);

  const text = await client.get("https://example.com/api/info").text();

  assertEquals(text, '{"message":"hello"}');
});

Deno.test("ResponsePromise can be awaited directly", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: "test" });

  const client = new FetchClient();
  mocks.install(client);

  // Await the ResponsePromise directly to get the full response
  const response = await client.get("https://example.com/api/data", {
    headers: { Accept: "application/json" },
  });

  assertEquals(response.status, 200);
  assert(response.ok);
  assertEquals(response.data, { value: "test" });
});

Deno.test("default export fc.get().json<T>() works", async () => {
  // Import the default export and the default provider instance
  const { default: fc, defaultProviderInstance } = await import("../../mod.ts");

  const mocks = new MockRegistry();
  mocks.onGet("/api/user").reply(200, { id: 1, name: "Test User" });

  // Install mocks on the default provider instance that fc uses
  mocks.install(defaultProviderInstance);

  // Use the default export with the fluent API
  const user = await fc.get("https://example.com/api/user", {
    headers: { Accept: "application/json" },
  }).json<{ id: number; name: string }>();

  assertEquals(user.id, 1);
  assertEquals(user.name, "Test User");
});

Deno.test("default export fc.getJSON<T>() works", async () => {
  // Import the default export and the default provider instance
  const { default: fc, defaultProviderInstance } = await import("../../mod.ts");

  const mocks = new MockRegistry();
  mocks.onGet("/api/user").reply(200, { id: 2, name: "Another User" });

  // Install mocks on the default provider instance that fc uses
  mocks.install(defaultProviderInstance);

  const response = await fc.getJSON<{ id: number; name: string }>(
    "https://example.com/api/user",
  );

  assertEquals(response.status, 200);
  assertEquals(response.data?.id, 2);
  assertEquals(response.data?.name, "Another User");
});

Deno.test("default export fc.use(fc.middleware.retry()) works", async () => {
  const { default: fc, defaultProviderInstance } = await import("../../mod.ts");

  const mocks = new MockRegistry();
  // First request fails, second succeeds
  mocks.onGet("/api/retry").replyOnce(500, { error: "Server Error" });
  mocks.onGet("/api/retry").reply(200, { success: true });

  mocks.install(defaultProviderInstance);

  // Use fc.use with fc.middleware.retry
  fc.use(fc.middleware.retry({ limit: 2, delay: () => 10, jitter: 0 }));

  const result = await fc.get("https://example.com/api/retry").json<
    { success: boolean }
  >();

  assertEquals(result.success, true);
  assertEquals(mocks.history.get.length, 2); // First failed, second succeeded
});
