import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  FetchClient,
  type FetchClientContext,
  ProblemDetails,
} from "../../mod.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

type Todo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

Deno.test("can use provider middleware", async () => {
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
    assertFalse(ctx.response);
    called = true;
    await next();
    assert(ctx.response);
  });

  const client = provider.getFetchClient();
  assert(client);

  const r = await client.getJSON<Todo>(
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

Deno.test("can use client middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
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

  const r = await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
  );

  assert(r.ok);
  assertEquals(r.status, 200);
  assert(called);
});

Deno.test("middleware can modify context", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "Original title",
    completed: false,
  });

  const client = new FetchClient();
  mocks.install(client);

  function customMiddleware(
    ctx: FetchClientContext,
    next: () => Promise<void>,
  ) {
    ctx.customValue = "middleware-value";
    return next();
  }

  let contextValue: string | undefined;
  client.use(customMiddleware);
  client.use(async (ctx, next) => {
    contextValue = ctx.customValue as string;
    await next();
  });

  await client.getJSON("https://example.com/todos/1");
  assertEquals(contextValue, "middleware-value");
});

Deno.test("middleware chain executes in order", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/data").reply(200, { value: 1 });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const executionOrder: string[] = [];

  provider.useMiddleware(async (_ctx, next) => {
    executionOrder.push("provider-before");
    await next();
    executionOrder.push("provider-after");
  });

  const client = provider.getFetchClient();

  client.use(async (_ctx, next) => {
    executionOrder.push("client-before");
    await next();
    executionOrder.push("client-after");
  });

  await client.getJSON("https://example.com/data");

  assertEquals(executionOrder, [
    "provider-before",
    "client-before",
    "client-after",
    "provider-after",
  ]);
});

Deno.test("will validate postJSON model with provider model validator", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/todos/1").reply(200, { success: true });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  let fetchCalled = false;
  provider.useMiddleware(async (_ctx, next) => {
    fetchCalled = true;
    await next();
  });

  const data = {
    email: "test@test",
    password: "test",
  };

  // deno-lint-ignore require-await
  provider.setModelValidator(async (data: object | null) => {
    const problem = new ProblemDetails();
    const d = data as { password: string };
    if (d?.password?.length < 6) {
      problem.errors.password = [
        "Password must be longer than or equal to 6 characters.",
      ];
    }
    return problem;
  });

  const client = provider.getFetchClient();
  const response = await client.postJSON(
    "https://jsonplaceholder.typicode.com/todos/1",
    data,
  );

  assertEquals(response.ok, false);
  assertEquals(fetchCalled, false);
  assertEquals(response.status, 422);
  assertFalse(response.data);
  assert(response.problem);
  assert(response.problem!.errors);
  assert(response.problem!.errors.password);
  assertEquals(response.problem!.errors.password!.length, 1);
  assertEquals(
    response.problem!.errors.password![0],
    "Password must be longer than or equal to 6 characters.",
  );
});

Deno.test("can use kitchen sink options", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/products/search").reply(200, {
    products: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });

  let called = false;
  let optionsCalled = false;

  // Apply options via constructor pattern
  const api = new FetchClient({
    baseUrl: "https://example.com",
    defaultRequestOptions: {
      headers: {
        "X-Test": "test",
      },
      expectedStatusCodes: [200],
      params: {
        limit: 3,
      },
      errorCallback: (response) => {
        if (response.status === 404) {
          console.log("Not found");
        }
      },
    },
    middleware: [
      async (ctx, next) => {
        assert(ctx);
        assert(ctx.request);
        assertFalse(ctx.response);
        optionsCalled = true;
        await next();
        assert(ctx.response);
      },
    ],
  }).use(async (ctx, next) => {
    assert(ctx);
    assert(ctx.request);
    assertFalse(ctx.response);
    called = true;
    await next();
    assert(ctx.response);
  });

  mocks.install(api);

  type Products = { products: Array<{ id: number }> };
  const res = await api.getJSON<Products>("/products/search?q=x");

  assertEquals(res.status, 200);
  assert(res.data?.products);
  assert(called);
  assert(optionsCalled);
});

Deno.test("middleware can access response data", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/data").reply(200, { value: 42, name: "test" });

  const client = new FetchClient();
  mocks.install(client);

  let responseData: unknown;
  client.use(async (ctx, next) => {
    await next();
    responseData = ctx.response?.data;
  });

  await client.getJSON("https://example.com/data");

  assertEquals(responseData, { value: 42, name: "test" });
});
