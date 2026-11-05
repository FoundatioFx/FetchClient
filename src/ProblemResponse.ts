import type { FetchClientResponse } from "./FetchClientResponse.ts";
import { getStatusText } from "./HttpStatusText.ts";
import type { ProblemDetails } from "./ProblemDetails.ts";

/**
 * Builds a synthetic, already-consumed response for a problem raised before or
 * instead of a real request (validation, timeout, rate limiting).
 */
export function createProblemResponse<T>(
  problem: ProblemDetails,
  url: string,
  headers: Headers = new Headers({ "Content-Type": "application/problem+json" }),
): FetchClientResponse<T> {
  const status = problem.status ?? 422;

  return {
    url,
    status,
    statusText: problem.title ?? getStatusText(status),
    body: null,
    bodyUsed: true,
    ok: false,
    headers,
    redirected: false,
    type: "basic",
    problem,
    data: null,
    meta: { links: {} },
    json: () => Promise.resolve(problem),
    text: () => Promise.resolve(JSON.stringify(problem)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    bytes: () => Promise.resolve(new Uint8Array()),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    clone: () => {
      throw new Error("Not implemented");
    },
  };
}
