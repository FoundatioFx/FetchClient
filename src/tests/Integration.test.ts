/**
 * Integration tests that make real HTTP requests.
 * These tests require network access and test against external APIs.
 */

import { assert, assertEquals } from "@std/assert";
import { FetchClient, getJSON, useFetchClient } from "../../mod.ts";
import { FetchClientProvider } from "../FetchClientProvider.ts";
import {
  buildRateLimitHeader,
  buildRateLimitPolicyHeader,
} from "../RateLimiter.ts";

type Products = {
  products: Array<{ id: number; name: string }>;
};

function integrationTest(name: string, fn: () => void | Promise<void>) {
  Deno.test(name, async () => {
    const netPermission = await Deno.permissions.query({ name: "net" });
    if (netPermission.state !== "granted") {
      console.log(
        `Skipping integration test '${name}' (net permission required)`,
      );
      return;
    }

    await fn();
  });
}

integrationTest("can getJSON from real API", async () => {
  const api = new FetchClient();
  const res = await api.getJSON<Products>(
    `https://dummyjson.com/products/search?q=iphone&limit=10`,
  );
  assertEquals(res.status, 200);
  assert(res.data?.products);
});

integrationTest("can use getJSON function export", async () => {
  const res = await getJSON<Products>(
    `https://dummyjson.com/products/search?q=iphone&limit=10`,
  );

  assertEquals(res.status, 200);
  assert(res.data?.products);
});

integrationTest("can getJSON with baseUrl from real API", async () => {
  const api = new FetchClient({
    baseUrl: "https://dummyjson.com",
  });
  const res = await api.getJSON<Products>(
    `/products/search?q=iphone&limit=10`,
  );
  assertEquals(res.status, 200);
  assert(res.data?.products);
});

integrationTest("can abort getJSON with real API", async () => {
  const provider = new FetchClientProvider();
  const client = provider.getFetchClient();
  let gotError = false;

  try {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort("Signal was aborted");
    }, 100);

    await client.getJSON("https://dummyjson.com/products/1?delay=2000", {
      timeout: 500,
      signal: controller.signal,
    });
  } catch (error) {
    assertEquals(error, "Signal was aborted");
    gotError = true;
  }

  assert(gotError);

  // can use expectedStatusCodes to not throw an error
  const response = await client.getJSON(
    "https://dummyjson.com/products/1?delay=2000",
    {
      timeout: 500,
      signal: AbortSignal.timeout(100),
      expectedStatusCodes: [408],
    },
  );

  assertEquals(response.status, 408);
  assertEquals(response.statusText, "Request Timeout");
  assertEquals(response.problem?.status, 408);
});

integrationTest("can getJSON with timeout from real API", async () => {
  const provider = new FetchClientProvider();

  const client = provider.getFetchClient();
  let gotError = false;

  try {
    // timeout is set to 100ms, but the request takes 2000ms
    // so it should throw a timeout error
    await client.getJSON("https://dummyjson.com/products/1?delay=2000", {
      timeout: 100,
    });
  } catch (error) {
    assertEquals((error as Response).status, 408);
    gotError = true;
  }

  assert(gotError);

  // can use expectedStatusCodes to not throw an error
  const response = await client.getJSON(
    "https://dummyjson.com/products/1?delay=2000",
    {
      timeout: 100,
      expectedStatusCodes: [408],
    },
  );

  assertEquals(response.status, 408);
  assertEquals(response.statusText, "Request Timeout");
});

integrationTest("can use useFetchClient function", async () => {
  let called = false;
  let optionsCalled = false;

  const res = await useFetchClient({
    baseUrl: "https://dummyjson.com",
    defaultRequestOptions: {
      headers: {
        "X-Test": "test",
      },
      expectedStatusCodes: [200],
      params: {
        limit: 4, // this will be overridden in the getJSON call
      },
      errorCallback: (response) => {
        if (response.status === 404) {
          console.log("Not found");
        }
      },
    },
    middleware: [
      async (ctx, next) => {
        assert(ctx);
        assert(ctx.request);
        optionsCalled = true;
        await next();
        assert(ctx.response);
      },
    ],
  })
    .use(async (ctx, next) => {
      assert(ctx);
      assert(ctx.request);
      called = true;
      await next();
      assert(ctx.response);
    })
    .getJSON<Products>(
      `products/search?q=x&limit=10`, // this will override the default params
    );

  assertEquals(res.status, 200);
  assert(res.data?.products);
  assertEquals(res.data.products.length, 10);
  assert(called);
  assert(optionsCalled);
});

integrationTest("can post FormData multipart", async () => {
  const client = new FetchClient();
  const fd = new FormData();
  fd.append("field1", "value1");
  fd.append("count", "42");
  const binaryBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
  fd.append(
    "file",
    new File(["Hello Multipart"], "greeting.txt", { type: "text/plain" }),
  );
  fd.append(
    "binary",
    new File([binaryBytes], "image.png", { type: "application/octet-stream" }),
  );

  let res;
  try {
    res = await client.postJSON<Record<string, unknown>>(
      "https://httpbin.org/post",
      fd,
      { expectedStatusCodes: [200, 503] },
    );
  } catch {
    console.log("httpbin.org unavailable, skipping test");
    return;
  }

  // Skip test if httpbin is temporarily unavailable
  if (res.status === 503) {
    console.log("httpbin.org returned 503, skipping test");
    return;
  }

  assertEquals(res.status, 200);
  assert(res.data);
  const dataObj = res.data as Record<string, unknown>;
  // httpbin returns form fields under .form and files under .files
  const form = dataObj.form as Record<string, string>;
  const files = dataObj.files as Record<string, string>;
  assertEquals(form.field1, "value1");
  assertEquals(form.count, "42");
  assertEquals(files.file, "Hello Multipart");
  // binary may be base64 or raw; just ensure it's present
  assert(files.binary && typeof files.binary === "string");
});

integrationTest(
  "can use per-domain rate limiting with auto-update from headers",
  async () => {
    const provider = new FetchClientProvider();

    const groupTracker = new Map<string, number>();

    const startTime = Date.now();

    groupTracker.set("api.example.com", 100);
    groupTracker.set("slow-api.example.com", 5);

    provider.usePerDomainRateLimit({
      maxRequests: 50, // Default limit
      windowSeconds: 60, // 1 minute default window
      autoUpdateFromHeaders: true,
      groups: {
        "api.example.com": {
          maxRequests: 75, // API will override this with headers
          windowSeconds: 60,
        },
        "slow-api.example.com": {
          maxRequests: 30, // API will override this with headers
          windowSeconds: 30,
        },
      },
    });

    provider.fetch = (
      input: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> => {
      let url: URL;
      if (input instanceof Request) {
        url = new URL(input.url);
      } else {
        url = new URL(input.toString());
      }

      const headers = new Headers({
        "Content-Type": "application/json",
      });

      // Simulate different rate limits for different domains
      if (url.hostname === "api.example.com") {
        headers.set("X-RateLimit-Limit", "100");
        let remaining = groupTracker.get("api.example.com") ?? 0;
        remaining = remaining > 0 ? remaining - 2 : 0;
        groupTracker.set("api.example.com", remaining);
        headers.set("X-RateLimit-Remaining", String(remaining));
      } else if (url.hostname === "slow-api.example.com") {
        let remaining = groupTracker.get("slow-api.example.com") ?? 0;
        remaining = remaining > 0 ? remaining - 2 : 0;
        groupTracker.set("slow-api.example.com", remaining);

        headers.set(
          "RateLimit-Policy",
          buildRateLimitPolicyHeader({
            policy: "slow-api.example.com",
            limit: 5,
            windowSeconds: 30,
          }),
        );
        headers.set(
          "RateLimit",
          buildRateLimitHeader({
            policy: "slow-api.example.com",
            remaining: remaining,
            resetSeconds: 30 - ((Date.now() - startTime) / 1000),
          }),
        );
      }
      // other-api.example.com gets no rate limit headers

      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          statusText: "OK",
          headers,
        }),
      );
    };

    assert(provider.rateLimiter);

    const client = provider.getFetchClient();

    // check API rate limit
    let apiOptions = provider.rateLimiter.getGroupOptions("api.example.com");
    assertEquals(apiOptions.maxRequests, 75);
    assertEquals(apiOptions.windowSeconds, 60);

    const response1 = await client.getJSON(
      "https://api.example.com/data",
    );
    assertEquals(response1.status, 200);

    apiOptions = provider.rateLimiter.getGroupOptions("api.example.com");
    assertEquals(apiOptions.maxRequests, 100); // Updated from headers

    // check slow API rate limit
    let slowApiOptions = provider.rateLimiter.getGroupOptions(
      "slow-api.example.com",
    );
    assertEquals(slowApiOptions.maxRequests, 30);
    assertEquals(slowApiOptions.windowSeconds, 30);

    const response2 = await client.getJSON(
      "https://slow-api.example.com/data",
    );
    assertEquals(response2.status, 200);

    slowApiOptions = provider.rateLimiter.getGroupOptions(
      "slow-api.example.com",
    );
    assertEquals(slowApiOptions.maxRequests, 5); // Updated from headers
  },
);
