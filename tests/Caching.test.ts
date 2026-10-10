import { assert, expect, test } from "vite-plus/test";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

type Todo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

function delay(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}

test("can getJSON with caching", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
  });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  let r = await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    expectedStatusCodes: [404],
    cacheKey: ["todos", "1"],
  });

  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  assert(r.data);
  expect(r.data!.userId).toBe(1);
  expect(r.data!.id).toBe(1);
  expect(r.data!.title).toBe("A random title");
  expect(r.data!.completed).toBe(false);
  expect(provider.isLoading).toBe(false);
  expect(mocks.history.all.length).toBe(1);
  expect(provider.cache.has(["todos", "1"])).toBe(true);

  // Second request should use cache
  r = await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    expectedStatusCodes: [404],
    cacheKey: ["todos", "1"],
  });
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  assert(r.data);
  expect(mocks.history.all.length).toBe(1); // Still 1, used cache
  expect(provider.cache.has(["todos", "1"])).toBe(true);

  // Delete cache and fetch again
  provider.cache.delete(["todos", "1"]);

  r = await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    expectedStatusCodes: [404],
    cacheKey: ["todos", "1"],
    cacheDuration: 10,
  });
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  expect(mocks.history.all.length).toBe(2); // Incremented
  expect(provider.cache.has(["todos", "1"])).toBe(true);

  // Wait for cache to expire
  await delay(100);

  r = await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    expectedStatusCodes: [404],
    cacheKey: ["todos", "1"],
  });
  expect(r.ok).toBe(true);
  expect(r.status).toBe(200);
  expect(mocks.history.all.length).toBe(3); // Incremented after expiration
});

test("can getJSON with cache tags", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "Todo 1",
    completed: false,
  });
  mocks.onGet("/todos/2").reply(200, {
    userId: 1,
    id: 2,
    title: "Todo 2",
    completed: false,
  });
  mocks.onGet("/todos/3").reply(200, {
    userId: 1,
    id: 3,
    title: "Todo 3",
    completed: false,
  });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  // Cache multiple entries with shared tags
  await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    cacheKey: ["todos", "1"],
    cacheTags: ["todos", "user:1"],
  });

  await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/2", {
    cacheKey: ["todos", "2"],
    cacheTags: ["todos", "user:1"],
  });

  await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/3", {
    cacheKey: ["todos", "3"],
    cacheTags: ["todos", "user:2"],
  });

  expect(mocks.history.all.length).toBe(3);
  expect(provider.cache.has(["todos", "1"])).toBe(true);
  expect(provider.cache.has(["todos", "2"])).toBe(true);
  expect(provider.cache.has(["todos", "3"])).toBe(true);

  // Verify tags are tracked
  const tags = provider.cache.getTags();
  expect(tags).toContain("todos");
  expect(tags).toContain("user:1");
  expect(tags).toContain("user:2");

  // Verify entry tags
  const entry1Tags = provider.cache.getEntryTags(["todos", "1"]);
  expect(entry1Tags).toContain("todos");
  expect(entry1Tags).toContain("user:1");

  // Delete by tag - should remove entries for user:1
  const deletedCount = provider.cache.deleteByTag("user:1");
  expect(deletedCount).toBe(2);
  expect(provider.cache.has(["todos", "1"])).toBe(false);
  expect(provider.cache.has(["todos", "2"])).toBe(false);
  expect(provider.cache.has(["todos", "3"])).toBe(true);

  // Re-fetch the deleted entries
  await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    cacheKey: ["todos", "1"],
    cacheTags: ["todos", "user:1"],
  });

  expect(mocks.history.all.length).toBe(4);
  expect(provider.cache.has(["todos", "1"])).toBe(true);

  // Delete all by "todos" tag - should remove all remaining
  const deletedAll = provider.cache.deleteByTag("todos");
  expect(deletedAll).toBe(2);
  expect(provider.cache.has(["todos", "1"])).toBe(false);
  expect(provider.cache.has(["todos", "3"])).toBe(false);
});

test("cache tags are cleaned up on expiration", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "Test",
    completed: false,
  });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    cacheKey: ["todos", "1"],
    cacheTags: ["expiring-tag"],
    cacheDuration: 10,
  });

  expect(provider.cache.has(["todos", "1"])).toBe(true);
  let tags = provider.cache.getTags();
  expect(tags).toContain("expiring-tag");

  // Wait for expiration
  await delay(50);

  // Access the cache to trigger expiration cleanup
  const result = provider.cache.get(["todos", "1"]);
  expect(result).toBeNull();

  // Tag should be cleaned up
  tags = provider.cache.getTags();
  expect(tags.includes("expiring-tag")).toBe(false);
});

test("cache tags are cleaned up on delete", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "Test",
    completed: false,
  });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  await client.getJSON<Todo>("https://jsonplaceholder.typicode.com/todos/1", {
    cacheKey: ["todos", "1"],
    cacheTags: ["delete-tag"],
  });

  expect(provider.cache.has(["todos", "1"])).toBe(true);
  let tags = provider.cache.getTags();
  expect(tags).toContain("delete-tag");

  // Delete the entry
  provider.cache.delete(["todos", "1"]);

  // Tag should be cleaned up
  tags = provider.cache.getTags();
  expect(tags.includes("delete-tag")).toBe(false);
});

test("cache tags work with deleteAll prefix", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/users/1").reply(200, { id: 1 });
  mocks.onGet("/users/2").reply(200, { id: 2 });
  mocks.onGet("/posts/1").reply(200, { id: 1 });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  await client.getJSON("https://example.com/users/1", {
    cacheKey: ["users", "1"],
    cacheTags: ["users"],
  });

  await client.getJSON("https://example.com/users/2", {
    cacheKey: ["users", "2"],
    cacheTags: ["users"],
  });

  await client.getJSON("https://example.com/posts/1", {
    cacheKey: ["posts", "1"],
    cacheTags: ["posts"],
  });

  let tags = provider.cache.getTags();
  expect(tags).toContain("users");
  expect(tags).toContain("posts");

  // Delete all users by prefix
  const deleted = provider.cache.deleteAll(["users"]);
  expect(deleted).toBe(2);

  // Users tag should be cleaned up, posts tag should remain
  tags = provider.cache.getTags();
  expect(tags.includes("users")).toBe(false);
  expect(tags).toContain("posts");
});

test("cache clear removes all tags", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/test").reply(200, { id: 1 });

  const provider = new FetchClientProvider();
  mocks.install(provider);

  const client = provider.getFetchClient();

  await client.getJSON("https://example.com/test", {
    cacheKey: "test",
    cacheTags: ["tag1", "tag2"],
  });

  let tags = provider.cache.getTags();
  expect(tags.length).toBe(2);

  provider.cache.clear();

  tags = provider.cache.getTags();
  expect(tags.length).toBe(0);
});

test("deleteByTag returns 0 for non-existent tag", () => {
  const provider = new FetchClientProvider();
  const deleted = provider.cache.deleteByTag("non-existent");
  expect(deleted).toBe(0);
});
