import type { FetchClientResponse } from "./FetchClientResponse.ts";
import { getStatusText } from "./HttpStatusText.ts";

/**
 * Error wrapper for request failures with an HTTP response.
 * Exposes the underlying response for compatibility and debugging.
 */
export class FetchClientError extends Error {
  /** The response that caused the error. */
  public readonly response: FetchClientResponse<unknown>;

  constructor(response: FetchClientResponse<unknown>, message?: string) {
    super(message ?? response.problem?.title ?? getStatusText(response.status));
    this.name = "FetchClientError";
    this.response = response;
  }

  /** The HTTP status code of the response. */
  get status(): number {
    return this.response.status;
  }

  /** The HTTP status text of the response. */
  get statusText(): string {
    return this.response.statusText;
  }

  /** Whether the status is in the 200-299 range. */
  get ok(): boolean {
    return this.response.ok;
  }

  /** The response headers. */
  get headers(): Headers {
    return this.response.headers;
  }

  /** The URL of the response. */
  get url(): string {
    return this.response.url;
  }

  /** Whether the response is the result of a redirect. */
  get redirected(): boolean {
    return this.response.redirected;
  }

  /** The response type. */
  get type(): ResponseType {
    return this.response.type;
  }

  /** The response body stream. */
  get body(): ReadableStream<Uint8Array> | null {
    return this.response.body;
  }

  /** Whether the response body has been read. */
  get bodyUsed(): boolean {
    return this.response.bodyUsed;
  }

  /** The parsed response data, or `null` for error responses. */
  get data(): unknown {
    return this.response.data;
  }

  /** The problem details describing the error. */
  get problem(): unknown {
    return this.response.problem;
  }

  /** Response metadata, such as parsed `Link` headers. */
  get meta(): unknown {
    return this.response.meta;
  }

  /** Reads the response body as JSON. */
  json(): Promise<unknown> {
    return this.response.json();
  }

  /** Reads the response body as text. */
  text(): Promise<string> {
    return this.response.text();
  }

  /** Reads the response body as an ArrayBuffer. */
  arrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer();
  }

  /** Reads the response body as a Blob. */
  blob(): Promise<Blob> {
    return this.response.blob();
  }

  /** Reads the response body as FormData. */
  formData(): Promise<FormData> {
    return this.response.formData();
  }

  /** Reads the response body as bytes. */
  bytes(): Promise<Uint8Array> {
    return this.response.bytes();
  }

  /** Clones the underlying response. */
  clone(): Response {
    return this.response.clone();
  }
}

/**
 * Error thrown when the body of a successful response cannot be read or
 * deserialized as JSON.
 */
export class FetchClientDeserializationError extends FetchClientError {
  public override readonly cause: unknown;
  public readonly responseText: string;

  constructor(response: FetchClientResponse<unknown>, cause: unknown, responseText: string) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(response, `Unable to deserialize response data: ${detail}`);
    this.name = "FetchClientDeserializationError";
    this.cause = cause;
    this.responseText = responseText;
  }
}
