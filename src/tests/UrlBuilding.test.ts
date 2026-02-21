import { assert, assertEquals } from "@std/assert";
import { FetchClient, setBaseUrl } from "../../mod.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

Deno.test("can getJSON relative URL", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, { id: 1 });

  const client = new FetchClient();
  let requestedUrl = "";

  // Track the URL that was requested
  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON(`/todos/1`);
  assertEquals(requestedUrl, "http://localhost/todos/1");
});

Deno.test("can use params option to add query parameters", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, { id: 1 });

  const client = new FetchClient();
  let requestedUrl = "";

  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON(`todos/1`, {
    params: {
      limit: 3,
    },
  });
  assertEquals(requestedUrl, "http://localhost/todos/1?limit=3");
});

Deno.test("can use baseUrl option", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/users/123").reply(200, { id: 123, name: "Test" });

  const client = new FetchClient({
    baseUrl: "https://api.example.com",
  });

  let requestedUrl = "";
  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON(`/users/123`);
  assertEquals(requestedUrl, "https://api.example.com/users/123");
});

Deno.test("can use global setBaseUrl", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/products/search").reply(200, {
    products: [{ id: 1 }],
  });

  // Set global base URL
  setBaseUrl("https://dummyjson.com");

  const api = new FetchClient();
  assertEquals(api.options.baseUrl, "https://dummyjson.com");

  let requestedUrl = "";
  api.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(api);

  await api.getJSON(`products/search?q=iphone&limit=10`);
  assert(requestedUrl.startsWith("https://dummyjson.com/products/search"));

  // Reset global base URL
  setBaseUrl("");
});

Deno.test("params are merged with existing query string", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/search").reply(200, { results: [] });

  const client = new FetchClient();
  let requestedUrl = "";

  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON(`https://example.com/search?q=test`, {
    params: {
      limit: 10,
      page: 2,
    },
  });

  const url = new URL(requestedUrl);
  assertEquals(url.searchParams.get("q"), "test");
  assertEquals(url.searchParams.get("limit"), "10");
  assertEquals(url.searchParams.get("page"), "2");
});

Deno.test("url without leading slash uses baseUrl correctly", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/users").reply(200, [{ id: 1 }]);

  const client = new FetchClient({
    baseUrl: "https://example.com/api",
  });

  let requestedUrl = "";
  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON(`users`);
  assertEquals(requestedUrl, "https://example.com/api/users");
});

Deno.test("absolute URL ignores baseUrl", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/data").reply(200, { id: 1 });

  const client = new FetchClient({
    baseUrl: "https://api.example.com",
  });

  let requestedUrl = "";
  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON(`https://other.example.com/data`);
  assertEquals(requestedUrl, "https://other.example.com/data");
});

Deno.test("default request params are merged with per-request params", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/search").reply(200, { results: [] });

  const client = new FetchClient({
    defaultRequestOptions: {
      params: {
        limit: 3,
        sort: "desc",
      },
    },
  });

  let requestedUrl = "";
  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON("https://example.com/search", {
    params: {
      page: 2,
      limit: 10,
    },
  });

  const url = new URL(requestedUrl);
  assertEquals(url.searchParams.get("sort"), "desc");
  assertEquals(url.searchParams.get("page"), "2");
  assertEquals(url.searchParams.get("limit"), "10");
});

Deno.test("array params are handled correctly", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/filter").reply(200, { results: [] });

  const client = new FetchClient();
  let requestedUrl = "";

  client.use(async (ctx, next) => {
    requestedUrl = ctx.request.url;
    await next();
  });

  mocks.install(client);

  await client.getJSON(`https://example.com/filter`, {
    params: {
      ids: [1, 2, 3],
      tags: ["a", "b"],
    },
  });

  // The exact format depends on implementation - checking the URL contains the params
  assert(requestedUrl.includes("ids="));
  assert(requestedUrl.includes("tags="));
});
