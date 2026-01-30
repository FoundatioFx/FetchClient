/**
 * Definition of a mock response configuration.
 */
export interface MockDefinition {
  /** HTTP method to match, or null for any method */
  method: string | null;
  /** URL pattern to match (string or RegExp) */
  url: string | RegExp;
  /** HTTP status code to return */
  status: number;
  /** Response data (will be JSON stringified) */
  data?: unknown;
  /** Response headers */
  headers?: Record<string, string>;
  /** If true, mock is removed after first match */
  once: boolean;
  /** If true, request passes through to real fetch */
  passthrough: boolean;
  /** If set, throws TypeError with this message */
  networkError?: string;
  /** If true, throws TimeoutError */
  timeout: boolean;
  /** Delay in milliseconds before returning response */
  delay?: number;
  /** Headers that must match for this mock to apply */
  headerMatchers?: Record<string, string>;
  /** Body matcher - exact match or predicate function */
  bodyMatcher?: unknown | ((body: unknown) => boolean);
}

/**
 * Recorded request history organized by HTTP method.
 */
export interface MockHistory {
  /** GET requests */
  readonly get: Request[];
  /** POST requests */
  readonly post: Request[];
  /** PUT requests */
  readonly put: Request[];
  /** PATCH requests */
  readonly patch: Request[];
  /** DELETE requests */
  readonly delete: Request[];
  /** All requests in order */
  readonly all: Request[];
}
