# Usage Examples

This page consolidates common examples from the README.

## Model Validator

```ts
import {
  FetchClient,
  ProblemDetails,
  setModelValidator,
} from "@foundatiofx/fetchclient";

setModelValidator(async (data: object | null) => {
  // use zod or any other validator
  const problem = new ProblemDetails();
  const d = data as { password: string };
  if (d?.password?.length < 6) {
    problem.errors.password = [
      "Password must be longer than or equal to 6 characters.",
    ];
  }
  return problem;
});

const client = new FetchClient();
const data = { email: "test@test", password: "test" };

const response = await client.postJSON(
  "https://jsonplaceholder.typicode.com/todos/1",
  data,
);

if (!response.ok) {
  console.log(response.problem.detail);
}
```

## Caching

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

type Todo = { userId: number; id: number; title: string; completed: boolean };

const client = new FetchClient();
const response = await client.getJSON<Todo>(
  `https://jsonplaceholder.typicode.com/todos/1`,
  {
    cacheKey: ["todos", "1"],
    cacheDuration: 1000 * 60, // 1 minute
  },
);

// Invalidate programmatically
client.cache.delete(["todos", "1"]);

// Invalidate by prefix
client.cache.deleteAll(["todos"]); // Removes all entries starting with "todos:"
```

## Cache Tagging

Use cache tags to group related cache entries and invalidate them together:

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

// Cache entries with shared tags
await client.getJSON("/api/users/1", {
  cacheKey: ["users", "1"],
  cacheTags: ["users", "user-data"],
});

await client.getJSON("/api/users/2", {
  cacheKey: ["users", "2"],
  cacheTags: ["users", "user-data"],
});

await client.getJSON("/api/posts/1", {
  cacheKey: ["posts", "1"],
  cacheTags: ["posts", "user-data"],
});

// Invalidate all user entries
client.cache.deleteByTag("users"); // Removes users/1 and users/2

// Invalidate all user-related data (users and posts)
client.cache.deleteByTag("user-data"); // Removes all three entries

// Check available tags
const tags = client.cache.getTags(); // ["posts"] after deleteByTag("users")

// Get tags for a specific entry
const entryTags = client.cache.getEntryTags(["posts", "1"]); // ["posts", "user-data"]
```

Tags are automatically cleaned up when entries expire or are deleted.

## Rate Limiting

```ts
import { FetchClient, useRateLimit } from "@foundatiofx/fetchclient";

useRateLimit({ maxRequests: 100, windowSeconds: 60 });

const client = new FetchClient();
await client.getJSON(`https://api.example.com/data`);
```

## Request Timeout & Cancellation

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

// Timeout per request
await client.getJSON(`https://api.example.com/data`, { timeout: 5000 });

// AbortSignal
const controller = new AbortController();
setTimeout(() => controller.abort(), 1000);

await client.getJSON(`https://api.example.com/data`, {
  signal: controller.signal,
});
```

## Error Handling

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

try {
  await client.getJSON(`https://api.example.com/data`);
} catch (error) {
  if ((error as any).problem) {
    console.log((error as any).problem.title);
    console.log((error as any).problem.detail);
  }
}

// Or handle specific status codes
await client.getJSON(`https://api.example.com/data`, {
  expectedStatusCodes: [404, 500],
  errorCallback: (response) => {
    if (response.status === 404) {
      console.log("Resource not found");
      return true; // Don't throw
    }
  },
});
```

## Authentication

```ts
import { FetchClient, setAccessTokenFunc } from "@foundatiofx/fetchclient";

setAccessTokenFunc(() => localStorage.getItem("token"));

const client = new FetchClient();
await client.getJSON(`https://api.example.com/data`);
// Authorization: Bearer <token>
```

## Base URL

```ts
import { FetchClient, setBaseUrl } from "@foundatiofx/fetchclient";

setBaseUrl("https://api.example.com");

const client = new FetchClient();
await client.getJSON(`/users/123`);
// Requests to https://api.example.com/users/123
```

## Loading State

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

client.loading.on((isLoading) => {
  console.log(`Loading: ${isLoading}`);
});

console.log(client.isLoading);
console.log(client.requestCount);
```
