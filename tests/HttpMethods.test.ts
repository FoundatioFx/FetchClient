import { assert, expect, test } from "vite-plus/test";
import { FetchClient } from "../src/FetchClient.ts";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

type Todo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

test("can getJSON with client middleware", async () => {
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
    expect(ctx).toBeTruthy();
    expect(ctx.request).toBeTruthy();
    assert(ctx.options.expectedStatusCodes);
    expect(ctx.options.expectedStatusCodes.length).toBeGreaterThan(0);
    expect(ctx.response).toBeFalsy();
    expect(provider.isLoading).toBe(true);
    called = true;
    await next();
    assert(ctx.response);
  });

  const client = provider.getFetchClient();
  const r = await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    expectedStatusCodes: [404],
  });

  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  assert(r.data);
  expect(called).toBe(true);
  expect(r.data!.userId).toBe(1);
  expect(r.data!.id).toBe(1);
  expect(r.data!.title).toBe("A random title");
  expect(r.data!.completed).toBe(false);
  expect(provider.isLoading).toBe(false);
});

test("can queryJSON with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onQuery("/todos/search").reply(200, [{ id: 1, title: "Match" }]);

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.use(async (ctx, next) => {
    expect(ctx.request.method).toBe("QUERY");
    expect(ctx.request.headers.get("Content-Type")).toBe("application/json");
    expect(ctx.request.headers.get("Accept")).toBe("application/json, application/problem+json");
    expect(await ctx.request.clone().json()).toEqual({ completed: false });
    called = true;
    await next();
  });

  const response = await client.queryJSON<Array<Pick<Todo, "id" | "title">>>(
    "https://example.com/todos/search",
    { completed: false },
  );

  expect(called).toBe(true);
  expect(response.data).toEqual([{ id: 1, title: "Match" }]);
  expect(mocks.history.query.length).toBe(1);
});

test("query sends application/x-www-form-urlencoded content", async () => {
  const mocks = new MockRegistry();
  mocks.onQuery("/feed").reply(200, []);

  const client = new FetchClient();
  mocks.install(client);

  await client.query(
    "https://example.com/feed",
    new URLSearchParams({ q: "foo", limit: "10", sort: "-published" }),
  );

  const request = mocks.history.query[0];
  expect(request.headers.get("Content-Type")).toBe(
    "application/x-www-form-urlencoded;charset=UTF-8",
  );
  expect(await request.text()).toBe("q=foo&limit=10&sort=-published");
});

test("query sends application/sql content", async () => {
  const mocks = new MockRegistry();
  mocks.onQuery("/rfc-index.xml").reply(200, []);

  const client = new FetchClient();
  mocks.install(client);

  await client.query(
    "https://example.com/rfc-index.xml",
    new Blob(["SELECT * FROM rfc_index"], { type: "application/sql" }),
  );

  const request = mocks.history.query[0];
  expect(request.headers.get("Content-Type")).toBe("application/sql");
  expect(await request.text()).toBe("SELECT * FROM rfc_index");
});

test("can postJSON with client middleware", async () => {
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
    expect(ctx).toBeTruthy();
    expect(ctx.request).toBeTruthy();
    expect(ctx.options).toBeTruthy();
    expect(ctx.response).toBeFalsy();
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.postJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1");
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  assert(r.data);
  expect(called).toBe(true);
  expect(r.data!.userId).toBe(1);
  expect(r.data!.id).toBe(1);
  expect(r.data!.title).toBe("A random title");
  expect(r.data!.completed).toBe(false);
});

test("can putJSON with client middleware", async () => {
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
    expect(ctx).toBeTruthy();
    expect(ctx.request).toBeTruthy();
    expect(ctx.response).toBeFalsy();
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.putJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1");
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  assert(r.data);
  expect(called).toBe(true);
  expect(r.data!.userId).toBe(1);
  expect(r.data!.id).toBe(1);
  expect(r.data!.title).toBe("A random title");
  expect(r.data!.completed).toBe(false);
});

test("can patchJSON with client middleware", async () => {
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
    expect(ctx).toBeTruthy();
    expect(ctx.request).toBeTruthy();
    expect(ctx.response).toBeFalsy();
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.patchJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    completed: true,
  });
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  assert(r.data);
  expect(called).toBe(true);
  expect(r.data!.title).toBe("Updated title");
  expect(r.data!.completed).toBe(true);
});

test("can deleteJSON with client middleware", async () => {
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
    expect(ctx).toBeTruthy();
    expect(ctx.request).toBeTruthy();
    expect(ctx.response).toBeFalsy();
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.deleteJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1");
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  assert(r.data);
  expect(called).toBe(true);
  expect(r.data!.userId).toBe(1);
  expect(r.data!.id).toBe(1);
  expect(r.data!.title).toBe("A random title");
  expect(r.data!.completed).toBe(false);
});

test("json helpers preserve defaultRequestOptions headers", async () => {
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
  await client.postJSON(
    "https://example.com/todos/post",
    { id: 1 },
    {
      headers: {
        "X-Trace": "post",
      },
    },
  );
  await client.putJSON(
    "https://example.com/todos/put",
    { id: 1 },
    {
      headers: {
        "X-Trace": "put",
      },
    },
  );
  await client.patchJSON(
    "https://example.com/todos/patch",
    { id: 1 },
    {
      headers: {
        "X-Trace": "patch",
      },
    },
  );
  await client.deleteJSON("https://example.com/todos/delete", {
    headers: {
      "X-Trace": "delete",
    },
  });

  for (const request of mocks.history.all) {
    expect(request.headers.get("X-Requested-By")).toBe("my-app");
    expect(request.headers.get("Accept")).toBe("application/json, application/problem+json");
    assert(request.headers.get("X-Trace"));
  }
});

test("can delete with 204 no content", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/todos/1").reply(204);

  const client = new FetchClient();
  mocks.install(client);

  const r = await client.delete("https://example.com/todos/1");

  expect(r.status).toBe(204);
  expect(await r.text()).toBe("");
});

test("can get loading status", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").delay(10).reply(200, { id: 1 });

  const client = new FetchClient();
  mocks.install(client);

  const response = client.getJSON("https://example.com/todos/1");
  expect(client.isLoading).toBe(true);

  await response;
  expect(client.isLoading).toBe(false);
});

test("can use loading event", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").delay(10).reply(200, { id: 1 });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.loading.on((_isLoading) => {
    called = true;
  });

  const response = client.getJSON("https://example.com/todos/1");
  expect(client.isLoading).toBe(true);

  await response;
  expect(called).toBe(true);
  expect(client.isLoading).toBe(false);
});

test("request history is recorded", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/users").reply(200, []);
  mocks.onPost("/users").reply(201, { id: 1 });

  const client = new FetchClient();
  mocks.install(client);

  await client.getJSON("https://example.com/users");
  await client.postJSON("https://example.com/users", { name: "Test" });
  await client.getJSON("https://example.com/users");

  expect(mocks.history.get.length).toBe(2);
  expect(mocks.history.post.length).toBe(1);
  expect(mocks.history.all.length).toBe(3);
});

test("can head with client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onHead("/todos/1").reply(200, null, {
    "Content-Length": "1234",
    "Content-Type": "application/json",
  });

  const client = new FetchClient();
  mocks.install(client);

  let called = false;
  client.use(async (ctx, next) => {
    expect(ctx).toBeTruthy();
    expect(ctx.request).toBeTruthy();
    expect(ctx.request.method).toBe("HEAD");
    expect(ctx.response).toBeFalsy();
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.head("https://jsonplaceholder.typicode.com/todos/1");
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  expect(called).toBe(true);
  expect(r.headers.get("Content-Length")).toBe("1234");
});

test("head request history is recorded", async () => {
  const mocks = new MockRegistry();
  mocks.onHead("/users").reply(200);
  mocks.onGet("/users").reply(200, []);

  const client = new FetchClient();
  mocks.install(client);

  await client.head("https://example.com/users");
  await client.getJSON("https://example.com/users");
  await client.head("https://example.com/users");

  expect(mocks.history.head.length).toBe(2);
  expect(mocks.history.get.length).toBe(1);
  expect(mocks.history.all.length).toBe(3);
});

test("can use .json<T>() helper on get()", async () => {
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

  expect(user.id).toBe(1);
  expect(user.name).toBe("John Doe");
  expect(user.email).toBe("john@example.com");
});

test("can use .json<T>() helper on post()", async () => {
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

  expect(created.id).toBe(42);
  expect(created.name).toBe("Jane Smith");
});

test("can use .text() helper on get()", async () => {
  const mocks = new MockRegistry();
  // MockRegistry JSON-encodes bodies by default, so we pass an object
  // and verify we get the JSON-stringified version via .text()
  mocks.onGet("/api/info").reply(200, { message: "hello" });

  const client = new FetchClient();
  mocks.install(client);

  const text = await client.get("https://example.com/api/info").text();

  expect(text).toBe('{"message":"hello"}');
});

test("ResponsePromise can be awaited directly", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/data").reply(200, { value: "test" });

  const client = new FetchClient();
  mocks.install(client);

  // Await the ResponsePromise directly to get the full response
  const response = await client.get("https://example.com/api/data", {
    headers: { Accept: "application/json" },
  });

  expect(response.status).toBe(200);
  expect(response.ok).toBe(true);
  expect(response.data).toEqual({ value: "test" });
});

test("default export fc.get().json<T>() works", async () => {
  // Import the default export and the default provider instance
  const { default: fc, defaultProviderInstance } = await import("../src/index.ts");

  const mocks = new MockRegistry();
  mocks.onGet("/api/user").reply(200, { id: 1, name: "Test User" });

  // Install mocks on the default provider instance that fc uses
  mocks.install(defaultProviderInstance);

  // Use the default export with the fluent API
  const user = await fc
    .get("https://example.com/api/user", {
      headers: { Accept: "application/json" },
    })
    .json<{ id: number; name: string }>();

  expect(user.id).toBe(1);
  expect(user.name).toBe("Test User");
});

test("default export fc.getJSON<T>() works", async () => {
  // Import the default export and the default provider instance
  const { default: fc, defaultProviderInstance } = await import("../src/index.ts");

  const mocks = new MockRegistry();
  mocks.onGet("/api/user").reply(200, { id: 2, name: "Another User" });

  // Install mocks on the default provider instance that fc uses
  mocks.install(defaultProviderInstance);

  const response = await fc.getJSON<{ id: number; name: string }>("https://example.com/api/user");

  expect(response.status).toBe(200);
  expect(response.data?.id).toBe(2);
  expect(response.data?.name).toBe("Another User");
});

test("default and named QUERY exports work", async () => {
  const { default: fc, defaultProviderInstance, queryJSON } = await import("../src/index.ts");

  const mocks = new MockRegistry();
  mocks.onQuery("/api/search").reply(200, [{ id: 1 }]);
  mocks.onQuery("/api/count").reply(200, { count: 1 });
  mocks.install(defaultProviderInstance);

  const searchResponse = await queryJSON<Array<{ id: number }>>("https://example.com/api/search", {
    term: "test",
  });
  const count = await fc
    .query(
      "https://example.com/api/count",
      { term: "test" },
      { headers: { Accept: "application/json" } },
    )
    .json<{ count: number }>();

  expect(searchResponse.data).toEqual([{ id: 1 }]);
  expect(count).toEqual({ count: 1 });
  expect(mocks.history.query.length).toBe(2);
});

test("default export fc.use(fc.middleware.retry()) works", async () => {
  const { default: fc, defaultProviderInstance } = await import("../src/index.ts");

  const mocks = new MockRegistry();
  // First request fails, second succeeds
  mocks.onGet("/api/retry").replyOnce(500, { error: "Server Error" });
  mocks.onGet("/api/retry").reply(200, { success: true });

  mocks.install(defaultProviderInstance);

  // Use fc.use with fc.middleware.retry
  fc.use(fc.middleware.retry({ limit: 2, delay: () => 10, jitter: 0 }));

  const result = await fc.get("https://example.com/api/retry").json<{ success: boolean }>();

  expect(result.success).toBe(true);
  expect(mocks.history.get.length).toBe(2); // First failed, second succeeded
});
