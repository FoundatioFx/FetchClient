import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import {
  FetchClient,
  type FetchClientResponse,
  ProblemDetails,
} from "../../mod.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import { MockRegistry } from "../mocks/MockRegistry.ts";

Deno.test("can handle 404 error with expectedStatusCodes", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  // Using expectedStatusCodes to not throw an error
  const res = await client.getJSON(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      expectedStatusCodes: [404],
    },
  );
  assertFalse(res.ok);
  assertEquals(res.status, 404);
});

Deno.test("throws error for unexpected status codes by default", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  await assertRejects(async () => {
    await client.getJSON("https://jsonplaceholder.typicode.com/todos/1");
  });
});

Deno.test("can use shouldThrowOnUnexpectedStatusCodes to not throw", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  const res = await client.getJSON(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      shouldThrowOnUnexpectedStatusCodes: false,
    },
  );
  assertFalse(res.ok);
  assertEquals(res.status, 404);
});

Deno.test("can use errorCallback to not throw", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  const res = await client.getJSON(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      errorCallback: () => true, // Return true to suppress error
    },
  );
  assertFalse(res.ok);
  assertEquals(res.status, 404);
});

Deno.test("can use errorCallback to throw custom error", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  const error = await assertRejects(async () => {
    await client.getJSON("https://jsonplaceholder.typicode.com/todos/1", {
      errorCallback: (res) => {
        throw res.problem ?? res;
      },
    });
  });
  assert(error instanceof ProblemDetails);
});

Deno.test("errorCallback returning false or undefined throws", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);
  mocks.onGet("/todos/2").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  await assertRejects(async () => {
    await client.getJSON("https://example.com/todos/1", {
      errorCallback: () => false,
    });
  });

  await assertRejects(async () => {
    await client.getJSON("https://example.com/todos/2", {
      errorCallback: () => {},
    });
  });
});

Deno.test("handles 400 response with non-JSON text", async () => {
  // MockRegistry returns JSON by default, so we need to use the fakeFetch approach
  // for this specific test to return non-JSON text
  const provider = new FetchClientProvider();
  const fakeFetch = (): Promise<Response> =>
    new Promise((resolve) => {
      resolve(
        new Response("Hello World", {
          status: 400,
          statusText: "Bad Request",
        }),
      );
    });

  provider.fetch = fakeFetch;
  const client = provider.getFetchClient();

  // Test that the client throws an error for 400 status by default
  try {
    await client.deleteJSON("https://example.com/http/400/Hello World", {
      headers: { "Accept": "text/plain" },
    });
  } catch (error) {
    assert(error instanceof Response);
    const response = error as FetchClientResponse<unknown>;
    assertEquals(response.status, 400);
    assertEquals(response.statusText, "Bad Request");
    assertFalse(response.ok);
    assertEquals(response.data, null);
    assert(response.problem);
    assert(response.problem.errors);
    assert(response.problem.title);
    assertStringIncludes(response.problem.title, "Unexpected status");
    assert(response.problem.errors.general);
    assertEquals(response.problem.errors.general.length, 1);
    assertStringIncludes(
      response.problem.errors.general[0],
      "Unexpected status",
    );
  }

  // Test with expectedStatusCodes to handle 400 without throwing
  const response = await client.deleteJSON(
    "https://example.com/http/400/Hello World",
    {
      expectedStatusCodes: [400],
    },
  );

  assertEquals(response.status, 400);
  assertEquals(response.statusText, "Bad Request");
  assertFalse(response.ok);
  assertEquals(response.data, null);
  assert(response.problem);
  assert(response.problem.errors);
  assert(response.problem.title);
  assertStringIncludes(response.problem.title, "Unable to deserialize");
  assert(response.problem.errors.general);
  assertEquals(response.problem.errors.general.length, 1);
  assertStringIncludes(
    response.problem.errors.general[0],
    "Unable to deserialize",
  );
});

Deno.test("network error throws TypeError", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/flaky").networkError("Connection refused");

  const client = new FetchClient();
  mocks.install(client);

  await assertRejects(
    () => client.getJSON("https://example.com/api/flaky"),
    TypeError,
    "Connection refused",
  );
});

Deno.test("problem details are populated on error responses", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/error").reply(500, {
    type: "https://example.com/errors/internal",
    title: "Internal Server Error",
    status: 500,
    detail: "Something went wrong",
    errors: { server: ["Database connection failed"] },
  });

  const client = new FetchClient();
  mocks.install(client);

  const res = await client.getJSON("https://example.com/error", {
    expectedStatusCodes: [500],
  });

  assertFalse(res.ok);
  assertEquals(res.status, 500);
  assert(res.problem);
  assertEquals(res.problem.title, "Internal Server Error");
  assertEquals(res.problem.detail, "Something went wrong");
  assertEquals(res.problem.status, 500);
  assert(res.problem.errors.server);
  assertEquals(res.problem.errors.server[0], "Database connection failed");
});
