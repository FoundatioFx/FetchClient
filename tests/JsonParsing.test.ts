import { assert, expect, test } from "vite-plus/test";
import { FetchClient } from "../src/FetchClient.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";
import { z, type ZodTypeAny } from "zod";

const TodoSchema = z.object({
  userId: z.number(),
  id: z.number(),
  title: z.string(),
  completed: z.boolean(),
  completedTime: z.coerce.date().optional(),
});

type Todo = z.infer<typeof TodoSchema>;

test("can parse dates", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
    completedTime: "2021-01-01T00:00:00.000Z",
  });

  const client = new FetchClient();
  mocks.install(client);

  let res = await client.getJSON<Todo>(`https://jsonplaceholder.typicode.com/todos/1`);

  expect(res.status).toBe(200);
  assert(res.data);
  expect(res.data.completedTime instanceof Date).toBe(false);

  res = await client.getJSON<Todo>(`https://jsonplaceholder.typicode.com/todos/1`, {
    shouldParseDates: true,
  });

  expect(res.status).toBe(200);
  assert(res.data);
  expect(res.data.completedTime).toBeInstanceOf(Date);
});

test("can use reviver", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
    completedTime: "2021-01-01T00:00:00.000Z",
  });

  const client = new FetchClient();
  mocks.install(client);

  let res = await client.getJSON<Todo>(`https://jsonplaceholder.typicode.com/todos/1`);

  expect(res.status).toBe(200);
  assert(res.data);
  expect(res.data.completedTime instanceof Date).toBe(false);

  res = await client.getJSON<Todo>(`https://jsonplaceholder.typicode.com/todos/1`, {
    reviver: (key: string, value: unknown) => {
      if (key === "completedTime") {
        return new Date(value as string);
      }
      return value;
    },
  });

  expect(res.status).toBe(200);
  assert(res.data);
  expect(res.data.completedTime).toBeInstanceOf(Date);
});

test("can parse dates and use reviver together", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
    completedTime: "2021-01-01T00:00:00.000Z",
  });

  const client = new FetchClient();
  mocks.install(client);

  let res = await client.getJSON<Todo>(`https://jsonplaceholder.typicode.com/todos/1`);

  expect(res.status).toBe(200);
  assert(res.data);
  expect(res.data.title).toBe("A random title");
  expect(res.data.completedTime instanceof Date).toBe(false);

  res = await client.getJSON<Todo>(`https://jsonplaceholder.typicode.com/todos/1`, {
    shouldParseDates: true,
    reviver: (key: string, value: unknown) => {
      if (key === "title") {
        return "revived";
      }
      return value;
    },
  });

  expect(res.status).toBe(200);
  assert(res.data);
  expect(res.data.title).toBe("revived");
  expect(res.data.completedTime).toBeInstanceOf(Date);
});

test("can getJSON with zod schema via middleware", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(200, {
    userId: 1,
    id: 1,
    title: "A random title",
    completed: false,
    completedTime: "2021-01-01T00:00:00.000Z",
  });

  const client = new FetchClient();
  mocks.install(client);

  // Add middleware to validate with zod schema from meta
  client.use(async (ctx, next) => {
    await next();

    const meta = ctx.options.meta as { schema?: ZodTypeAny } | undefined;
    const schema = meta?.schema;
    if (schema) {
      const parsed = schema.safeParse(ctx.response!.data);

      if (parsed.success) {
        ctx.response!.data = parsed.data;
      }
    }
  });

  const res = await client.getJSON<Todo>(`https://jsonplaceholder.typicode.com/todos/1`, {
    meta: { schema: TodoSchema },
  });

  expect(res.status).toBe(200);
  assert(res.data);
  expect(TodoSchema.parse(res.data)).toBeTruthy();
  // zod coerce.date() should convert string to Date
  expect(res.data.completedTime).toBeInstanceOf(Date);
});

test("handles null response body", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/items/1").reply(204);

  const client = new FetchClient();
  mocks.install(client);

  // Use delete() not deleteJSON() for 204 no-content responses
  const res = await client.delete("https://example.com/items/1");

  expect(res.status).toBe(204);
  expect(await res.text()).toBe("");
});

test("handles array response", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/items").reply(200, [
    { id: 1, name: "Item 1" },
    { id: 2, name: "Item 2" },
    { id: 3, name: "Item 3" },
  ]);

  const client = new FetchClient();
  mocks.install(client);

  const res = await client.getJSON<Array<{ id: number; name: string }>>(
    "https://example.com/items",
  );

  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
  expect(res.data?.length).toBe(3);
  expect(res.data?.[0].id).toBe(1);
  expect(res.data?.[2].name).toBe("Item 3");
});

test("handles nested objects", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/user/profile").reply(200, {
    id: 1,
    name: "John",
    address: {
      street: "123 Main St",
      city: "Springfield",
      country: {
        code: "US",
        name: "United States",
      },
    },
    tags: ["admin", "user"],
  });

  const client = new FetchClient();
  mocks.install(client);

  type Profile = {
    id: number;
    name: string;
    address: {
      street: string;
      city: string;
      country: {
        code: string;
        name: string;
      };
    };
    tags: string[];
  };

  const res = await client.getJSON<Profile>("https://example.com/user/profile");

  expect(res.status).toBe(200);
  assert(res.data);
  expect(res.data.name).toBe("John");
  expect(res.data.address.city).toBe("Springfield");
  expect(res.data.address.country.code).toBe("US");
  expect(res.data.tags.length).toBe(2);
  expect(res.data.tags).toContain("admin");
});
