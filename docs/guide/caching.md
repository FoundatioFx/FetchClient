# Caching

FetchClient provides built-in response caching with TTL (time-to-live), cache
tags for grouped invalidation, and programmatic cache control.

## Basic Caching

Add `cacheKey` and `cacheDuration` to cache responses:

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

type Todo = { userId: number; id: number; title: string; completed: boolean };

const client = new FetchClient();
const response = await client.getJSON<Todo>(
  "https://jsonplaceholder.typicode.com/todos/1",
  {
    cacheKey: ["todos", "1"],
    cacheDuration: 1000 * 60, // 1 minute
  },
);

// Subsequent calls with the same cacheKey return cached data
const cached = await client.getJSON<Todo>(
  "https://jsonplaceholder.typicode.com/todos/1",
  {
    cacheKey: ["todos", "1"],
    cacheDuration: 1000 * 60,
  },
);
// No network request made - data comes from cache
```

## Cache Keys

Cache keys are arrays that get joined with colons. This makes it easy to
organize and invalidate related entries:

```ts
// These cache keys become:
// "users:123"
// "users:123:posts"
// "posts:456"

await client.getJSON("/api/users/123", {
  cacheKey: ["users", "123"],
});

await client.getJSON("/api/users/123/posts", {
  cacheKey: ["users", "123", "posts"],
});

await client.getJSON("/api/posts/456", {
  cacheKey: ["posts", "456"],
});
```

## Invalidating Cache

### Delete Specific Entry

```ts
client.cache.delete(["todos", "1"]);
```

### Delete by Prefix

Remove all entries that start with a prefix:

```ts
// Remove all user-related cache entries
client.cache.deleteAll(["users"]);

// This deletes:
// - "users:123"
// - "users:123:posts"
// - "users:456"
// etc.
```

### Clear All Cache

```ts
client.cache.clear();
```

## Cache Tagging

Tags let you group unrelated cache entries and invalidate them together. This is
useful when data relationships span different cache keys.

### Adding Tags

```ts
// Cache user data with tags
await client.getJSON("/api/users/1", {
  cacheKey: ["users", "1"],
  cacheTags: ["users", "active-session"],
});

await client.getJSON("/api/users/2", {
  cacheKey: ["users", "2"],
  cacheTags: ["users", "active-session"],
});

// Cache posts with overlapping tags
await client.getJSON("/api/posts/1", {
  cacheKey: ["posts", "1"],
  cacheTags: ["posts", "active-session"],
});
```

### Invalidate by Tag

```ts
// Invalidate all user cache entries
client.cache.deleteByTag("users");
// Removes users/1 and users/2, keeps posts/1

// Invalidate everything related to the session
client.cache.deleteByTag("active-session");
// Removes users/1, users/2, and posts/1
```

### Inspecting Tags

```ts
// Get all tags in use
const tags = client.cache.getTags();
// ["users", "posts", "active-session"]

// Get tags for a specific entry
const entryTags = client.cache.getEntryTags(["posts", "1"]);
// ["posts", "active-session"]
```

## Cache Behavior

- **Automatic cleanup**: Expired entries are removed automatically when accessed
- **Tag cleanup**: Tags are automatically cleaned up when their entries expire
  or are deleted
- **Memory-based**: Cache is stored in memory and clears on page refresh
- **Per-provider**: Each `FetchClientProvider` has its own cache instance

## Shared Cache with Provider

When using `FetchClientProvider`, all clients share the same cache:

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();

const client1 = provider.getFetchClient();
const client2 = provider.getFetchClient();

// Cache entry created by client1
await client1.getJSON("/api/data", {
  cacheKey: ["data"],
  cacheDuration: 60000,
});

// client2 gets the cached response
await client2.getJSON("/api/data", {
  cacheKey: ["data"],
  cacheDuration: 60000,
});

// Both clients share the same cache
console.log(client1.cache === client2.cache); // true
```

## Practical Example: User Dashboard

```ts
const client = new FetchClient();

// Load dashboard data with related tags
async function loadDashboard(userId: string) {
  const [user, posts, notifications] = await Promise.all([
    client.getJSON(`/api/users/${userId}`, {
      cacheKey: ["users", userId],
      cacheTags: ["dashboard", `user-${userId}`],
      cacheDuration: 5 * 60 * 1000, // 5 minutes
    }),
    client.getJSON(`/api/users/${userId}/posts`, {
      cacheKey: ["users", userId, "posts"],
      cacheTags: ["dashboard", `user-${userId}`, "posts"],
      cacheDuration: 2 * 60 * 1000, // 2 minutes
    }),
    client.getJSON(`/api/users/${userId}/notifications`, {
      cacheKey: ["users", userId, "notifications"],
      cacheTags: ["dashboard", `user-${userId}`],
      cacheDuration: 30 * 1000, // 30 seconds
    }),
  ]);

  return { user, posts, notifications };
}

// Refresh just the posts
function refreshPosts() {
  client.cache.deleteByTag("posts");
}

// Refresh entire dashboard
function refreshDashboard() {
  client.cache.deleteByTag("dashboard");
}

// User logged out - clear their data
function logout(userId: string) {
  client.cache.deleteByTag(`user-${userId}`);
}
```
