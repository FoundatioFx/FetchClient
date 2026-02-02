import type { FetchClientResponse } from "./FetchClientResponse.ts";

/**
 * Error wrapper for non-2xx responses.
 * Exposes the underlying response for compatibility and debugging.
 */
export class FetchClientError extends Error {
  public readonly response: FetchClientResponse<unknown>;

  constructor(
    response: FetchClientResponse<unknown>,
    message?: string,
  ) {
    super(
      message ??
        response.problem?.title ??
        `Unexpected status code: ${response.status}`,
    );
    this.name = "FetchClientError";
    this.response = response;
  }

  get status(): number {
    return this.response.status;
  }

  get statusText(): string {
    return this.response.statusText;
  }

  get ok(): boolean {
    return this.response.ok;
  }

  get headers(): Headers {
    return this.response.headers;
  }

  get url(): string {
    return this.response.url;
  }

  get redirected(): boolean {
    return this.response.redirected;
  }

  get type(): ResponseType {
    return this.response.type;
  }

  get body(): ReadableStream<Uint8Array> | null {
    return this.response.body;
  }

  get bodyUsed(): boolean {
    return this.response.bodyUsed;
  }

  get data(): unknown {
    return this.response.data;
  }

  get problem(): unknown {
    return this.response.problem;
  }

  get meta(): unknown {
    return this.response.meta;
  }

  json(): Promise<unknown> {
    return this.response.json();
  }

  text(): Promise<string> {
    return this.response.text();
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer();
  }

  blob(): Promise<Blob> {
    return this.response.blob();
  }

  formData(): Promise<FormData> {
    return this.response.formData();
  }

  // @ts-ignore: New in Deno 1.44
  bytes(): Promise<Uint8Array> {
    // @ts-ignore: New in Deno 1.44
    return this.response.bytes();
  }

  clone(): Response {
    return this.response.clone();
  }
}
