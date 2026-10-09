/**
 * Per-group rate limiter options that can override the global options.
 */
export interface GroupRateLimiterOptions {
  /**
   * Maximum number of requests allowed per time window for this group.
   */
  maxRequests?: number;

  /**
   * Time window in milliseconds for this group.
   */
  windowSeconds?: number;

  /**
   * Callback function called when rate limit is exceeded for this group.
   * @param resetTime - Time when the rate limit will reset (in milliseconds since epoch)
   */
  onRateLimitExceeded?: (resetTime: number) => void;
}

/**
 * Configuration options for the rate limiter.
 */
export interface RateLimiterOptions {
  /**
   * Maximum number of requests allowed per time window.
   */
  maxRequests: number;

  /**
   * Time window in seconds.
   */
  windowSeconds: number;

  /**
   * Optional group generator function to create unique rate limit buckets.
   * If not provided, a global rate limit is applied.
   * @param url - The request URL
   * @returns A string group to identify the rate limit bucket
   */
  getGroupFunc?: (url: string) => string;

  /**
   * Callback function called when rate limit is exceeded.
   * @param resetTime - Time when the rate limit will reset (in milliseconds since epoch)
   */
  onRateLimitExceeded?: (resetTime: number) => void;

  /**
   * Optional group-specific rate limit options.
   * Map of group keys to their specific rate limit options.
   */
  groups?: Record<string, GroupRateLimiterOptions>;
}

/**
 * Represents a rate limit bucket with request tracking.
 */
interface RateLimitBucket {
  requests: number[];
  resetTime: number;
}

/**
 * A rate limiter that tracks requests per time window.
 */
export class RateLimiter {
  private readonly options: Required<RateLimiterOptions>;
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly groupOptions = new Map<string, GroupRateLimiterOptions>();

  constructor(options: RateLimiterOptions) {
    this.options = {
      getGroupFunc: () => "global",
      onRateLimitExceeded: () => {},
      groups: {},
      ...options,
    };

    // Initialize group options if provided
    if (options.groups) {
      for (const [groupKey, groupOptions] of Object.entries(options.groups)) {
        this.groupOptions.set(groupKey, groupOptions);
      }
    }
  }

  /**
   * Checks if a request is allowed and updates the rate limit state.
   * @param url - The request URL
   * @returns True if the request is allowed, false if rate limit is exceeded
   */
  public isAllowed(url: string): boolean {
    const key = this.options.getGroupFunc(url);
    const groupOptions = this.getGroupOptions(key);
    const now = Date.now();

    // Use group-specific options if available, otherwise fall back to global options
    const maxRequests = groupOptions.maxRequests ?? 0;
    const windowSeconds = groupOptions.windowSeconds ?? 0;
    const onRateLimitExceeded =
      groupOptions.onRateLimitExceeded ?? this.options.onRateLimitExceeded;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        requests: [],
        resetTime: now + windowSeconds * 1000,
      };
      this.buckets.set(key, bucket);
    }

    // Clean up old requests outside the time window
    const windowStart = now - windowSeconds * 1000;
    bucket.requests = bucket.requests.filter((time) => time > windowStart);

    // Update reset time if all requests have expired
    if (bucket.requests.length === 0) {
      bucket.resetTime = now + windowSeconds * 1000;
    }

    // Check if we're within the rate limit
    if (bucket.requests.length >= maxRequests) {
      onRateLimitExceeded(bucket.resetTime);
      return false;
    }

    // Add the current request
    bucket.requests.push(now);
    return true;
  }

  /**
   * Gets the current request count for a specific key.
   * @param url - The request URL
   * @returns The current number of requests in the time window
   */
  public getRequestCount(url: string): number {
    const key = this.options.getGroupFunc(url);
    const groupOptions = this.getGroupOptions(key);
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return 0;
    }

    const now = Date.now();
    const windowSeconds = groupOptions.windowSeconds ?? 0;
    const windowStart = now - windowSeconds * 1000;
    return bucket.requests.filter((time) => time > windowStart).length;
  }

  /**
   * Gets the remaining requests allowed for a specific key.
   * @param url - The request URL
   * @returns The number of remaining requests allowed
   */
  public getRemainingRequests(url: string): number {
    const key = this.options.getGroupFunc(url);
    const groupOptions = this.getGroupOptions(key);
    const maxRequests = groupOptions.maxRequests ?? 0;

    return Math.max(0, maxRequests - this.getRequestCount(url));
  }

  /**
   * Gets the time when the rate limit will reset for a specific key.
   * @param url - The request URL
   * @returns The reset time in milliseconds since epoch, or null if no bucket exists
   */
  public getResetTime(url: string): number | null {
    const key = this.options.getGroupFunc(url);
    const bucket = this.buckets.get(key);
    return bucket?.resetTime ?? null;
  }

  /**
   * Clears the rate limit state for a specific key.
   * @param url - The request URL
   */
  public clearBucket(url: string): void {
    const key = this.options.getGroupFunc(url);
    this.buckets.delete(key);
  }

  /**
   * Gets the group key for a URL.
   * @param url - The request URL
   * @returns The group key
   */
  public getGroup(url: string): string {
    return this.options.getGroupFunc(url);
  }

  /**
   * Gets the options for a specific group. Falls back to global options if not set.
   * @param group - The group key
   * @returns The options for the group
   */
  public getGroupOptions(group: string): GroupRateLimiterOptions {
    const options = this.groupOptions.get(group);
    if (!options) {
      return {
        maxRequests: this.options.maxRequests,
        windowSeconds: this.options.windowSeconds,
      };
    }
    return options;
  }

  /**
   * Checks if a group has specific options set.
   * @param group - The group key
   * @returns True if the group has options, false otherwise
   */
  public hasGroupOptions(group: string): boolean {
    return this.groupOptions.has(group);
  }

  /**
   * Sets options for a specific group.
   * @param group - The group key
   * @param options - The options to set
   */
  public setGroupOptions(group: string, options: GroupRateLimiterOptions): void {
    this.groupOptions.set(group, options);
  }

  /**
   * Sets rate limit options for a request.
   * @param url - The request URL
   * @param options - The options to set for this group
   */
  public setOptionsForRequest(url: string, options: GroupRateLimiterOptions): void {
    const group = this.getGroup(url);
    this.setGroupOptions(group, options);
  }

  /**
   * Updates rate limit options for a request based on standard rate limit headers.
   * @param url - The request URL
   * @param method - The HTTP method
   * @param headers - The response headers containing rate limit information
   */
  public updateFromHeadersForRequest(url: string, headers: Headers): void {
    const group = this.getGroup(url);
    this.updateFromHeaders(group, headers);
  }

  /**
   * Updates rate limit options based on standard rate limit headers.
   * @param group - The group key
   * @param headers - The response headers containing rate limit information
   */
  public updateFromHeaders(group: string, headers: Headers): void {
    // Get existing group-specific options (not global fallback)
    const currentOptions = this.hasGroupOptions(group) ? this.groupOptions.get(group)! : {};
    const newOptions: GroupRateLimiterOptions = { ...currentOptions };

    // Parse IETF standard rate limit headers first, then fall back to x-ratelimit headers
    let limit: string | null = null;
    let window: string | null = null;
    let reset: string | null = null;

    // Try IETF standard headers first
    const rateLimitPolicyHeader = headers.get("ratelimit-policy");
    if (rateLimitPolicyHeader) {
      const parsed = parseRateLimitPolicyHeader(rateLimitPolicyHeader);
      if (parsed?.limit) {
        limit = parsed.limit.toString();
      }
      if (parsed?.windowSeconds) {
        window = parsed.windowSeconds.toString();
      }
    }

    const rateLimitHeader = headers.get("ratelimit");
    if (rateLimitHeader) {
      const parsed = parseRateLimitHeader(rateLimitHeader);
      if (parsed?.resetSeconds) {
        reset = parsed.resetSeconds.toString();
      }
    }

    // Fall back to x-ratelimit headers if IETF headers not found
    if (!limit) {
      limit = headers.get("x-ratelimit-limit") || headers.get("x-rate-limit-limit");
    }

    if (!window) {
      window = headers.get("x-ratelimit-window") || headers.get("x-rate-limit-window");
    }

    if (!reset) {
      reset = headers.get("x-ratelimit-reset") || headers.get("x-rate-limit-reset");
    }

    let hasChanges = false;

    // Apply the parsed values
    if (limit) {
      const maxRequests = parseInt(limit, 10);
      if (!isNaN(maxRequests)) {
        newOptions.maxRequests = maxRequests;
        hasChanges = true;
      }
    }

    if (window) {
      const windowSeconds = parseInt(window, 10);
      if (!isNaN(windowSeconds)) {
        newOptions.windowSeconds = windowSeconds;
        hasChanges = true;
      }
    } else if (reset) {
      // If no window header, try to calculate from reset time
      const resetTime = parseInt(reset, 10);
      if (!isNaN(resetTime)) {
        const now = Math.floor(Date.now() / 1000);
        const windowSeconds = Math.max(1, resetTime - now);
        newOptions.windowSeconds = windowSeconds;
        hasChanges = true;
      }
    }

    // Update the group options if we found valid headers
    if (hasChanges) {
      this.setGroupOptions(group, newOptions);
    }
  }

  /**
   * Clears all rate limit state.
   */
  public clearAll(): void {
    this.buckets.clear();
  }
}

/**
 * Creates a group generator function that groups requests by domain only (no protocol).
 * @param url - The request URL
 * @returns A string representing the domain without protocol
 */
export function groupByDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * IETF rate limit header information structure.
 */
export interface RateLimitInfo {
  /** The policy name/identifier */
  policy: string;
  /** Maximum requests allowed (quota) */
  limit: number;
  /** Remaining requests */
  remaining: number;
  /** Reset time in seconds from now */
  resetSeconds: number;
  /** Window duration in seconds */
  windowSeconds?: number;
}

/**
 * Creates an IETF standard RateLimit header value.
 * @param info - The rate limit information
 * @returns The formatted RateLimit header value
 */
export function buildRateLimitHeader(info: Omit<RateLimitInfo, "limit" | "windowSeconds">): string {
  let headerValue = `"${info.policy}";r=${info.remaining}`;

  if (info.resetSeconds > 0) {
    headerValue += `;t=${info.resetSeconds}`;
  }

  return headerValue;
}

/**
 * Creates an IETF standard RateLimit-Policy header value.
 * @param info - The rate limit information
 * @returns The formatted RateLimit-Policy header value
 */
export function buildRateLimitPolicyHeader(
  info: Omit<RateLimitInfo, "remaining" | "resetSeconds">,
): string {
  let headerValue = `"${info.policy}";q=${info.limit}`;

  if (info.windowSeconds && info.windowSeconds > 0) {
    headerValue += `;w=${info.windowSeconds}`;
  }

  return headerValue;
}

/**
 * Parses an IETF standard RateLimit header value.
 * @param headerValue - The RateLimit header value to parse
 * @returns The parsed rate limit information or null if invalid
 */
export function parseRateLimitHeader(headerValue: string): Partial<RateLimitInfo> | null {
  if (!headerValue) return null;

  try {
    const result: Partial<RateLimitInfo> = {};

    // Extract policy name (quoted string at the beginning)
    const policyMatch = headerValue.match(/^"([^"]+)"/);
    if (policyMatch) {
      result.policy = policyMatch[1];
    }

    // Extract remaining (r parameter)
    const remainingMatch = headerValue.match(/r=(\d+)/);
    if (remainingMatch) {
      result.remaining = parseInt(remainingMatch[1], 10);
    }

    // Extract reset time (t parameter)
    const resetMatch = headerValue.match(/t=(\d+)/);
    if (resetMatch) {
      result.resetSeconds = parseInt(resetMatch[1], 10);
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Parses an IETF standard RateLimit-Policy header value.
 * @param headerValue - The RateLimit-Policy header value to parse
 * @returns The parsed rate limit policy information or null if invalid
 */
export function parseRateLimitPolicyHeader(headerValue: string): Partial<RateLimitInfo> | null {
  if (!headerValue) return null;

  try {
    const result: Partial<RateLimitInfo> = {};

    // Extract policy name (quoted string at the beginning)
    const policyMatch = headerValue.match(/^"([^"]+)"/);
    if (policyMatch) {
      result.policy = policyMatch[1];
    }

    // Extract quota/limit (q parameter)
    const quotaMatch = headerValue.match(/q=(\d+)/);
    if (quotaMatch) {
      result.limit = parseInt(quotaMatch[1], 10);
    }

    // Extract window (w parameter)
    const windowMatch = headerValue.match(/w=(\d+)/);
    if (windowMatch) {
      result.windowSeconds = parseInt(windowMatch[1], 10);
    }

    return result;
  } catch {
    return null;
  }
}
