import { assert, expect, test } from "vite-plus/test";
import {
  FetchClient,
  FetchClientDeserializationError,
  FetchClientError,
  type FetchClientResponse,
  ProblemDetails,
} from "../src/index.ts";
import { FetchClientProvider } from "../src/FetchClientProvider.ts";
import { MockRegistry } from "../src/mocks/MockRegistry.ts";

test("can handle 404 error with expectedStatusCodes", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  // Using expectedStatusCodes to not throw an error
  const res = await client.getJSON("https://jsonplaceholder.typicode.com/todos/1", {
    expectedStatusCodes: [404],
  });
  expect(res.ok).toBe(false);
  expect(res.status).toBe(404);
});

test("throws error for unexpected status codes by default", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  await expect(client.getJSON("https://jsonplaceholder.typicode.com/todos/1")).rejects.toThrow(
    FetchClientError,
  );
});

test("can use shouldThrowOnUnexpectedStatusCodes to not throw", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  const res = await client.getJSON("https://jsonplaceholder.typicode.com/todos/1", {
    shouldThrowOnUnexpectedStatusCodes: false,
  });
  expect(res.ok).toBe(false);
  expect(res.status).toBe(404);
});

test("can use errorCallback to not throw", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  const res = await client.getJSON("https://jsonplaceholder.typicode.com/todos/1", {
    errorCallback: () => true, // Return true to suppress error
  });
  expect(res.ok).toBe(false);
  expect(res.status).toBe(404);
});

test("can use errorCallback to throw custom error", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  await expect(
    client.getJSON("https://jsonplaceholder.typicode.com/todos/1", {
      errorCallback: (res) => {
        throw res.problem ?? res;
      },
    }),
  ).rejects.toBeInstanceOf(ProblemDetails);
});

test("errorCallback returning false or undefined throws", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/todos/1").reply(404);
  mocks.onGet("/todos/2").reply(404);

  const client = new FetchClient();
  mocks.install(client);

  await expect(
    client.getJSON("https://example.com/todos/1", {
      errorCallback: () => false,
    }),
  ).rejects.toThrow(FetchClientError);

  await expect(
    client.getJSON("https://example.com/todos/2", {
      errorCallback: () => {},
    }),
  ).rejects.toThrow(FetchClientError);
});

test("handles 400 response with non-JSON text", async () => {
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
      headers: { Accept: "text/plain" },
    });
  } catch (error) {
    assert(error instanceof FetchClientError);
    const response = error.response as FetchClientResponse<unknown>;
    expect(response.status).toBe(400);
    expect(response.statusText).toBe("Bad Request");
    expect(response.ok).toBe(false);
    expect(response.data).toBeNull();
    expect(response.problem).toBeTruthy();
    expect(response.problem.errors).toBeTruthy();
    assert(response.problem.title);
    expect(response.problem.title).toContain("Bad Request");
    assert(response.problem.errors.general);
    expect(response.problem.errors.general.length).toBe(1);
    expect(response.problem.errors.general[0]).toContain("Bad Request");
  }

  // Test with expectedStatusCodes to handle 400 without throwing
  const response = await client.deleteJSON("https://example.com/http/400/Hello World", {
    expectedStatusCodes: [400],
  });

  expect(response.status).toBe(400);
  expect(response.statusText).toBe("Bad Request");
  expect(response.ok).toBe(false);
  expect(response.data).toBeNull();
  expect(response.problem).toBeTruthy();
  expect(response.problem.errors).toBeTruthy();
  assert(response.problem.title);
  expect(response.problem.title).toContain("Unable to deserialize");
  assert(response.problem.errors.general);
  expect(response.problem.errors.general.length).toBe(1);
  expect(response.problem.errors.general[0]).toContain("Unable to deserialize");
});

test("handles 403 with empty body without deserialization error", async () => {
  const mocks = new MockRegistry();
  mocks.onPost("/api/resource").reply(403);

  const client = new FetchClient();
  mocks.install(client);

  // Should throw FetchClientError with status-based message, not a deserialization error
  const error = await client
    .postJSON("https://example.com/api/resource", {})
    .catch((e: unknown) => e);

  assert(error instanceof FetchClientError);
  expect(error.status).toBe(403);
  assert(error.response.problem);
  expect(error.response.problem.status).toBe(403);
  expect(error.message).toContain("Forbidden");
  // Should NOT contain deserialization error
  expect(error.message.includes("Unable to deserialize")).toBeFalsy();
});

test("handles empty body error response with expectedStatusCodes", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/resource").reply(403);

  const client = new FetchClient();
  mocks.install(client);

  const res = await client.getJSON("https://example.com/api/resource", {
    expectedStatusCodes: [403],
  });

  expect(res.ok).toBe(false);
  expect(res.status).toBe(403);
  expect(res.problem).toBeTruthy();
  // Problem title should not mention deserialization failure
  expect(res.problem.title?.includes("Unable to deserialize") ?? false).toBe(false);
});

test("network error throws TypeError", async () => {
  const mocks = new MockRegistry();
  mocks.onGet("/api/flaky").networkError("Connection refused");

  const client = new FetchClient();
  mocks.install(client);

  const request = client.getJSON("https://example.com/api/flaky");
  await expect(request).rejects.toThrow(TypeError);
  await expect(request).rejects.toThrow("Connection refused");
});

test("problem details are populated on error responses", async () => {
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

  expect(res.ok).toBe(false);
  expect(res.status).toBe(500);
  expect(res.problem).toBeTruthy();
  expect(res.problem.title).toBe("Internal Server Error");
  expect(res.problem.detail).toBe("Something went wrong");
  expect(res.problem.status).toBe(500);
  assert(res.problem.errors.server);
  expect(res.problem.errors.server[0]).toBe("Database connection failed");
});

test("malformed JSON in a successful response throws a deserialization error", async () => {
  const provider = new FetchClientProvider();
  provider.fetch = () =>
    Promise.resolve(
      new Response('{"value":', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

  const client = provider.getFetchClient();
  let callbackResponse: FetchClientResponse<unknown> | undefined;

  const error = await client
    .getJSON("https://example.com/malformed", {
      errorCallback: (response) => {
        callbackResponse = response;
        return false;
      },
    })
    .catch((e: unknown) => e);

  assert(error instanceof FetchClientDeserializationError);
  expect(error.cause).toBeInstanceOf(SyntaxError);
  expect(error.responseText).toBe('{"value":');
  expect(error.response.status).toBe(200);
  assert(error.response.ok);
  expect(error.response.data).toBeNull();
  expect(error.response.problem.title ?? "").toContain("Unable to deserialize response data");
  expect(callbackResponse).toBe(error.response);
  expect(client.requestCount).toBe(0);
  expect(provider.requestCount).toBe(0);
});

test("aborting a successful response body read preserves the abort reason", async () => {
  const provider = new FetchClientProvider();
  // Node links a Request's signal to its init signal weakly, so keep the
  // Request reachable until the abort fires.
  let activeRequest: Request | undefined;
  provider.fetch = (request) => {
    activeRequest = request instanceof Request ? request : new Request(request);
    const signal = activeRequest.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":'));
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    });

    return Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  const client = provider.getFetchClient();
  const abortController = new AbortController();
  const abortReason = new DOMException("Query cancelled", "AbortError");
  let middlewareSawAbort = false;
  client.use(async (_context, next) => {
    try {
      await next();
    } catch (error) {
      middlewareSawAbort = error === abortReason;
      throw error;
    }
  });

  const request = client.getJSON("https://example.com/stream", {
    signal: abortController.signal,
  });
  setTimeout(() => abortController.abort(abortReason), 10);

  await expect(request).rejects.toBe(abortReason);
  expect(activeRequest?.signal.aborted).toBe(true);
  expect(middlewareSawAbort).toBe(true);
  expect(client.requestCount).toBe(0);
  expect(provider.requestCount).toBe(0);
});
