import { assert, assertEquals, assertFalse } from "@std/assert";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

type Todo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

function delay(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}

Deno.test("can getJSON with caching", async () => {
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

  let r = await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      expectedStatusCodes: [404],
      cacheKey: ["todos", "1"],
    },
  );

  assert(r.ok);
  assertEquals(r.status, 200);
  assert(r.data);
  assertEquals(r.data!.userId, 1);
  assertEquals(r.data!.id, 1);
  assertEquals(r.data!.title, "A random title");
  assertFalse(r.data!.completed);
  assertFalse(provider.isLoading);
  assertEquals(mocks.history.all.length, 1);
  assert(provider.cache.has(["todos", "1"]));

  // Second request should use cache
  r = await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      expectedStatusCodes: [404],
      cacheKey: ["todos", "1"],
    },
  );
  assert(r.ok);
  assertEquals(r.status, 200);
  assert(r.data);
  assertEquals(mocks.history.all.length, 1); // Still 1, used cache
  assert(provider.cache.has(["todos", "1"]));

  // Delete cache and fetch again
  provider.cache.delete(["todos", "1"]);

  r = await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      expectedStatusCodes: [404],
      cacheKey: ["todos", "1"],
      cacheDuration: 10,
    },
  );
  assert(r.ok);
  assertEquals(r.status, 200);
  assertEquals(mocks.history.all.length, 2); // Incremented
  assert(provider.cache.has(["todos", "1"]));

  // Wait for cache to expire
  await delay(100);

  r = await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      expectedStatusCodes: [404],
      cacheKey: ["todos", "1"],
    },
  );
  assert(r.ok);
  assertEquals(r.status, 200);
  assertEquals(mocks.history.all.length, 3); // Incremented after expiration
});

Deno.test("can getJSON with cache tags", async () => {
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
  await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      cacheKey: ["todos", "1"],
      cacheTags: ["todos", "user:1"],
    },
  );

  await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/2",
    {
      cacheKey: ["todos", "2"],
      cacheTags: ["todos", "user:1"],
    },
  );

  await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/3",
    {
      cacheKey: ["todos", "3"],
      cacheTags: ["todos", "user:2"],
    },
  );

  assertEquals(mocks.history.all.length, 3);
  assert(provider.cache.has(["todos", "1"]));
  assert(provider.cache.has(["todos", "2"]));
  assert(provider.cache.has(["todos", "3"]));

  // Verify tags are tracked
  const tags = provider.cache.getTags();
  assert(tags.includes("todos"));
  assert(tags.includes("user:1"));
  assert(tags.includes("user:2"));

  // Verify entry tags
  const entry1Tags = provider.cache.getEntryTags(["todos", "1"]);
  assert(entry1Tags.includes("todos"));
  assert(entry1Tags.includes("user:1"));

  // Delete by tag - should remove entries for user:1
  const deletedCount = provider.cache.deleteByTag("user:1");
  assertEquals(deletedCount, 2);
  assertFalse(provider.cache.has(["todos", "1"]));
  assertFalse(provider.cache.has(["todos", "2"]));
  assert(provider.cache.has(["todos", "3"]));

  // Re-fetch the deleted entries
  await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      cacheKey: ["todos", "1"],
      cacheTags: ["todos", "user:1"],
    },
  );

  assertEquals(mocks.history.all.length, 4);
  assert(provider.cache.has(["todos", "1"]));

  // Delete all by "todos" tag - should remove all remaining
  const deletedAll = provider.cache.deleteByTag("todos");
  assertEquals(deletedAll, 2);
  assertFalse(provider.cache.has(["todos", "1"]));
  assertFalse(provider.cache.has(["todos", "3"]));
});

Deno.test("cache tags are cleaned up on expiration", async () => {
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

  await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      cacheKey: ["todos", "1"],
      cacheTags: ["expiring-tag"],
      cacheDuration: 10,
    },
  );

  assert(provider.cache.has(["todos", "1"]));
  let tags = provider.cache.getTags();
  assert(tags.includes("expiring-tag"));

  // Wait for expiration
  await delay(50);

  // Access the cache to trigger expiration cleanup
  const result = provider.cache.get(["todos", "1"]);
  assertEquals(result, null);

  // Tag should be cleaned up
  tags = provider.cache.getTags();
  assertFalse(tags.includes("expiring-tag"));
});

Deno.test("cache tags are cleaned up on delete", async () => {
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

  await client.getJSON<Todo>(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      cacheKey: ["todos", "1"],
      cacheTags: ["delete-tag"],
    },
  );

  assert(provider.cache.has(["todos", "1"]));
  let tags = provider.cache.getTags();
  assert(tags.includes("delete-tag"));

  // Delete the entry
  provider.cache.delete(["todos", "1"]);

  // Tag should be cleaned up
  tags = provider.cache.getTags();
  assertFalse(tags.includes("delete-tag"));
});

Deno.test("cache tags work with deleteAll prefix", async () => {
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
  assert(tags.includes("users"));
  assert(tags.includes("posts"));

  // Delete all users by prefix
  const deleted = provider.cache.deleteAll(["users"]);
  assertEquals(deleted, 2);

  // Users tag should be cleaned up, posts tag should remain
  tags = provider.cache.getTags();
  assertFalse(tags.includes("users"));
  assert(tags.includes("posts"));
});

Deno.test("cache clear removes all tags", async () => {
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
  assertEquals(tags.length, 2);

  provider.cache.clear();

  tags = provider.cache.getTags();
  assertEquals(tags.length, 0);
});

Deno.test("deleteByTag returns 0 for non-existent tag", () => {
  const provider = new FetchClientProvider();
  const deleted = provider.cache.deleteByTag("non-existent");
  assertEquals(deleted, 0);
});
