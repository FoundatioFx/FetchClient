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
