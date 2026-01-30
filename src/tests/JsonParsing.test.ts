import { assert, assertEquals, assertFalse } from "@std/assert";
import { FetchClient } from "../FetchClient.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";
import { z, type ZodTypeAny } from "zod";

const TodoSchema = z.object({
  userId: z.number(),
  id: z.number(),
  title: z.string(),
  completed: z.boolean(),
  completedTime: z.coerce.date().optional(),
});

type Todo = z.infer<typeof TodoSchema>;

Deno.test("can parse dates", async () => {
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

  let res = await client.getJSON<Todo>(
    `https://jsonplaceholder.typicode.com/todos/1`,
  );

  assertEquals(res.status, 200);
  assert(res.data);
  assertFalse(res.data.completedTime instanceof Date);

  res = await client.getJSON<Todo>(
    `https://jsonplaceholder.typicode.com/todos/1`,
    {
      shouldParseDates: true,
    },
  );

  assertEquals(res.status, 200);
  assert(res.data);
  assert(res.data.completedTime instanceof Date);
});

Deno.test("can use reviver", async () => {
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

  let res = await client.getJSON<Todo>(
    `https://jsonplaceholder.typicode.com/todos/1`,
  );

  assertEquals(res.status, 200);
  assert(res.data);
  assertFalse(res.data.completedTime instanceof Date);

  res = await client.getJSON<Todo>(
    `https://jsonplaceholder.typicode.com/todos/1`,
    {
      reviver: (key: string, value: unknown) => {
        if (key === "completedTime") {
          return new Date(<string> value);
        }
        return value;
      },
    },
  );

  assertEquals(res.status, 200);
  assert(res.data);
  assert(res.data.completedTime instanceof Date);
});

Deno.test("can parse dates and use reviver together", async () => {
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

  let res = await client.getJSON<Todo>(
    `https://jsonplaceholder.typicode.com/todos/1`,
  );

  assertEquals(res.status, 200);
  assert(res.data);
  assertEquals(res.data.title, "A random title");
  assertFalse(res.data.completedTime instanceof Date);

  res = await client.getJSON<Todo>(
    `https://jsonplaceholder.typicode.com/todos/1`,
    {
      shouldParseDates: true,
      reviver: (key: string, value: unknown) => {
        if (key === "title") {
          return "revived";
        }
        return value;
      },
    },
  );

  assertEquals(res.status, 200);
  assert(res.data);
  assertEquals(res.data.title, "revived");
  assert(res.data.completedTime instanceof Date);
});

Deno.test("can getJSON with zod schema via middleware", async () => {
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

  const res = await client.getJSON<Todo>(
    `https://jsonplaceholder.typicode.com/todos/1`,
    {
      meta: { schema: TodoSchema },
    },
  );

  assertEquals(res.status, 200);
  assert(res.data);
  assert(TodoSchema.parse(res.data));
  // zod coerce.date() should convert string to Date
  assert(res.data.completedTime instanceof Date);
});

Deno.test("handles null response body", async () => {
  const mocks = new MockRegistry();
  mocks.onDelete("/items/1").reply(204);

  const client = new FetchClient();
  mocks.install(client);

  // Use delete() not deleteJSON() for 204 no-content responses
  const res = await client.delete("https://example.com/items/1");

  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
});

Deno.test("handles array response", async () => {
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

  assertEquals(res.status, 200);
  assert(Array.isArray(res.data));
  assertEquals(res.data?.length, 3);
  assertEquals(res.data?.[0].id, 1);
  assertEquals(res.data?.[2].name, "Item 3");
});

Deno.test("handles nested objects", async () => {
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

  assertEquals(res.status, 200);
  assert(res.data);
  assertEquals(res.data.name, "John");
  assertEquals(res.data.address.city, "Springfield");
  assertEquals(res.data.address.country.code, "US");
  assertEquals(res.data.tags.length, 2);
  assert(res.data.tags.includes("admin"));
});
