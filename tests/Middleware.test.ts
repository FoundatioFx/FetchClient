import { afterEach, assert, beforeEach, expect, test } from "vite-plus/test";
import { FetchClient, type FetchClientContext, ProblemDetails } from "../src/index.ts";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

type Todo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

let mocks: MockRegistry;

beforeEach(() => {
  mocks = new MockRegistry();
});

afterEach(() => {
  mocks.restore();
});

test("can use provider middleware", async () => {
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
    expect(ctx.request).toBeInstanceOf(Request);
    expect(ctx.response).toBeNull();
    called = true;
    await next();
    assert(ctx.response);
  });

  const client = provider.getFetchClient();
  expect(client).toBeInstanceOf(FetchClient);

  const r = await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1");
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  expect(called).toBe(true);
  expect(r.data).toEqual({
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
  });
});

test("can use client middleware", async () => {
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
    expect(ctx.request).toBeInstanceOf(Request);
    expect(ctx.response).toBeNull();
    called = true;
    await next();
    assert(ctx.response);
  });

  const r = await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1");

  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  expect(called).toBe(true);
});

test("middleware can modify context", async () => {
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "Original title",
    completed: false,
  });

  const client = new FetchClient();
  mocks.install(client);

  function customMiddleware(ctx: FetchClientContext, next: () => Promise<void>) {
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
  expect(contextValue).toBe("middleware-value");
});

test("middleware chain executes in order", async () => {
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

  expect(executionOrder).toEqual([
    "provider-before",
    "client-before",
    "client-after",
    "provider-after",
  ]);
});

test("will validate postJSON model with provider model validator", async () => {
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

  provider.setModelValidator(async (data: object | null) => {
    const problem = new ProblemDetails();
    const d = data as { password: string };
    if (d?.password?.length < 6) {
      problem.errors.password = ["Password must be longer than or equal to 6 characters."];
    }
    return problem;
  });

  const client = provider.getFetchClient();
  const response = await client.postJSON("https://jsonplaceholder.typicode.com/todos/1", data);

  expect(response.ok).toBe(false);
  expect(fetchCalled).toBe(false);
  expect(response.status).toBe(422);
  expect(response.data).toBeNull();
  expect(response.problem).toBeInstanceOf(ProblemDetails);
  expect(response.problem.errors.password).toEqual([
    "Password must be longer than or equal to 6 characters.",
  ]);
});

test("can use kitchen sink options", async () => {
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
        expect(ctx.request).toBeInstanceOf(Request);
        expect(ctx.response).toBeNull();
        optionsCalled = true;
        await next();
        assert(ctx.response);
      },
    ],
  }).use(async (ctx, next) => {
    expect(ctx.request).toBeInstanceOf(Request);
    expect(ctx.response).toBeNull();
    called = true;
    await next();
    assert(ctx.response);
  });

  mocks.install(api);

  type Products = { products: Array<{ id: number }> };
  const res = await api.getJSON<Products>("/products/search?q=x");

  expect(res.status).toBe(200);
  assert(res.data?.products);
  expect(called).toBe(true);
  expect(optionsCalled).toBe(true);
});

test("middleware can access response data", async () => {
  mocks.onGet("/data").reply(200, { value: 42, name: "test" });

  const client = new FetchClient();
  mocks.install(client);

  let responseData: unknown;
  client.use(async (ctx, next) => {
    await next();
    responseData = ctx.response?.data;
  });

  await client.getJSON("https://example.com/data");

  expect(responseData).toEqual({ value: 42, name: "test" });
});
