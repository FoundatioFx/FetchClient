/**
 * Circuit breaker state.
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests blocked
 * - HALF_OPEN: Testing if service recovered
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Options for configuring a circuit breaker group.
 */
export interface GroupCircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time window in ms for counting failures (default: 60000) */
  failureWindowMs?: number;
  /** Time in ms to stay OPEN before trying HALF_OPEN (default: 30000) */
  openDurationMs?: number;
  /** Number of successes in HALF_OPEN to close circuit (default: 2) */
  successThreshold?: number;
  /** Max concurrent requests allowed in HALF_OPEN state (default: 1) */
  halfOpenMaxAttempts?: number;
  /** Callback when circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Options for configuring the circuit breaker.
 */
export interface CircuitBreakerOptions extends GroupCircuitBreakerOptions {
  /** Function to determine which group a URL belongs to (default: returns "global") */
  getGroupFunc?: (url: string) => string;
  /** Per-group configuration overrides */
  groups?: Record<string, GroupCircuitBreakerOptions>;
  /** Callback when any circuit opens */
  onOpen?: (group: string) => void;
  /** Callback when any circuit closes */
  onClose?: (group: string) => void;
  /** Callback when any circuit enters half-open */
  onHalfOpen?: (group: string) => void;
}

interface CircuitBreakerBucket {
  state: CircuitState;
  failures: number[]; // Timestamps of failures in window
  successCount: number; // Consecutive successes in HALF_OPEN
  openedAt: number | null; // When circuit opened
  halfOpenAttempts: number; // Current concurrent requests in HALF_OPEN
}

type RequiredOptions =
  & Required<
    Omit<
      CircuitBreakerOptions,
      "groups" | "onOpen" | "onClose" | "onHalfOpen" | "onStateChange"
    >
  >
  & {
    onStateChange?: (from: CircuitState, to: CircuitState) => void;
  };

/**
 * Circuit breaker for preventing cascading failures.
 *
 * When a service starts failing (returning 5xx errors, timing out, etc.),
 * the circuit breaker "opens" and blocks further requests for a period,
 * allowing the service time to recover.
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,    // Open after 5 failures
 *   openDurationMs: 30000,  // Stay open for 30 seconds
 *   successThreshold: 2,    // Close after 2 successes in HALF_OPEN
 * });
 *
 * // Before making a request
 * if (!breaker.isAllowed(url)) {
 *   // Circuit is open, don't make request
 *   return;
 * }
 *
 * // After getting a response
 * if (response.status >= 500) {
 *   breaker.recordFailure(url);
 * } else {
 *   breaker.recordSuccess(url);
 * }
 * ```
 */
export class CircuitBreaker {
  #buckets: Map<string, CircuitBreakerBucket> = new Map();
  #groupOptions: Map<string, GroupCircuitBreakerOptions> = new Map();
  #options: RequiredOptions;
  #onOpen?: (group: string) => void;
  #onClose?: (group: string) => void;
  #onHalfOpen?: (group: string) => void;

  constructor(options?: CircuitBreakerOptions) {
    this.#options = {
      failureThreshold: options?.failureThreshold ?? 5,
      failureWindowMs: options?.failureWindowMs ?? 60000,
      openDurationMs: options?.openDurationMs ?? 30000,
      successThreshold: options?.successThreshold ?? 2,
      halfOpenMaxAttempts: options?.halfOpenMaxAttempts ?? 1,
      getGroupFunc: options?.getGroupFunc ?? (() => "global"),
      onStateChange: options?.onStateChange,
    };

    this.#onOpen = options?.onOpen;
    this.#onClose = options?.onClose;
    this.#onHalfOpen = options?.onHalfOpen;

    // Initialize per-group options
    if (options?.groups) {
      for (const [group, groupOpts] of Object.entries(options.groups)) {
        this.#groupOptions.set(group, groupOpts);
      }
    }
  }

  /**
   * Gets the effective options for a group.
   */
  #getOptions(
    group: string,
  ): Required<Omit<GroupCircuitBreakerOptions, "onStateChange">> & {
    onStateChange?: (from: CircuitState, to: CircuitState) => void;
  } {
    const groupOpts = this.#groupOptions.get(group);
    return {
      failureThreshold: groupOpts?.failureThreshold ??
        this.#options.failureThreshold,
      failureWindowMs: groupOpts?.failureWindowMs ??
        this.#options.failureWindowMs,
      openDurationMs: groupOpts?.openDurationMs ?? this.#options.openDurationMs,
      successThreshold: groupOpts?.successThreshold ??
        this.#options.successThreshold,
      halfOpenMaxAttempts: groupOpts?.halfOpenMaxAttempts ??
        this.#options.halfOpenMaxAttempts,
      onStateChange: groupOpts?.onStateChange ?? this.#options.onStateChange,
    };
  }

  /**
   * Gets or creates a bucket for the given group.
   */
  #getBucket(group: string): CircuitBreakerBucket {
    let bucket = this.#buckets.get(group);
    if (!bucket) {
      bucket = {
        state: "CLOSED",
        failures: [],
        successCount: 0,
        openedAt: null,
        halfOpenAttempts: 0,
      };
      this.#buckets.set(group, bucket);
    }
    return bucket;
  }

  /**
   * Transitions the circuit to a new state.
   */
  #transitionTo(
    group: string,
    bucket: CircuitBreakerBucket,
    newState: CircuitState,
  ): void {
    const oldState = bucket.state;
    if (oldState === newState) return;

    bucket.state = newState;

    // Reset state-specific counters
    if (newState === "OPEN") {
      bucket.openedAt = Date.now();
      bucket.successCount = 0;
      bucket.halfOpenAttempts = 0;
    } else if (newState === "HALF_OPEN") {
      bucket.successCount = 0;
      bucket.halfOpenAttempts = 0;
    } else if (newState === "CLOSED") {
      bucket.failures = [];
      bucket.openedAt = null;
      bucket.successCount = 0;
      bucket.halfOpenAttempts = 0;
    }

    // Trigger callbacks
    const opts = this.#getOptions(group);
    opts.onStateChange?.(oldState, newState);

    if (newState === "OPEN") {
      this.#onOpen?.(group);
    } else if (newState === "CLOSED") {
      this.#onClose?.(group);
    } else if (newState === "HALF_OPEN") {
      this.#onHalfOpen?.(group);
    }
  }

  /**
   * Cleans up old failures outside the time window.
   */
  #cleanupFailures(bucket: CircuitBreakerBucket, windowMs: number): void {
    const cutoff = Date.now() - windowMs;
    bucket.failures = bucket.failures.filter((t) => t > cutoff);
  }

  /**
   * Checks if a request to the given URL is allowed.
   * Call this before making a request.
   *
   * @param url - The URL being requested
   * @returns true if the request is allowed, false if circuit is open
   */
  isAllowed(url: string): boolean {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#getBucket(group);
    const opts = this.#getOptions(group);

    switch (bucket.state) {
      case "CLOSED":
        return true;

      case "OPEN": {
        // Check if enough time has passed to try HALF_OPEN
        const elapsed = Date.now() - (bucket.openedAt ?? 0);
        if (elapsed >= opts.openDurationMs) {
          this.#transitionTo(group, bucket, "HALF_OPEN");
          // Fall through to HALF_OPEN logic
        } else {
          return false;
        }
      }
      // falls through

      case "HALF_OPEN": {
        // Allow limited requests in HALF_OPEN
        if (bucket.halfOpenAttempts < opts.halfOpenMaxAttempts) {
          bucket.halfOpenAttempts++;
          return true;
        }
        return false;
      }
    }
  }

  /**
   * Records a successful response.
   * Call this after receiving a successful (non-failure) response.
   *
   * @param url - The URL that was requested
   */
  recordSuccess(url: string): void {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#getBucket(group);
    const opts = this.#getOptions(group);

    switch (bucket.state) {
      case "CLOSED":
        // Success in CLOSED state - nothing special to do
        // Optionally could reset failure count, but we use time-based cleanup
        break;

      case "HALF_OPEN":
        // Decrement in-flight counter
        bucket.halfOpenAttempts = Math.max(0, bucket.halfOpenAttempts - 1);
        bucket.successCount++;

        // Check if we've had enough successes to close
        if (bucket.successCount >= opts.successThreshold) {
          this.#transitionTo(group, bucket, "CLOSED");
        }
        break;

      case "OPEN":
        // Shouldn't happen - requests blocked in OPEN
        break;
    }
  }

  /**
   * Records a failed response.
   * Call this after receiving a failure response (5xx, timeout, network error).
   *
   * @param url - The URL that was requested
   */
  recordFailure(url: string): void {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#getBucket(group);
    const opts = this.#getOptions(group);

    switch (bucket.state) {
      case "CLOSED":
        // Clean up old failures
        this.#cleanupFailures(bucket, opts.failureWindowMs);

        // Record new failure
        bucket.failures.push(Date.now());

        // Check if we've hit the threshold
        if (bucket.failures.length >= opts.failureThreshold) {
          this.#transitionTo(group, bucket, "OPEN");
        }
        break;

      case "HALF_OPEN":
        // Failure in HALF_OPEN - back to OPEN
        bucket.halfOpenAttempts = Math.max(0, bucket.halfOpenAttempts - 1);
        this.#transitionTo(group, bucket, "OPEN");
        break;

      case "OPEN":
        // Shouldn't happen - requests blocked in OPEN
        break;
    }
  }

  /**
   * Gets the current state of the circuit for a URL.
   *
   * @param url - The URL to check
   * @returns The current circuit state
   */
  getState(url: string): CircuitState {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#buckets.get(group);
    if (!bucket) return "CLOSED";

    // Check for automatic transition to HALF_OPEN
    if (bucket.state === "OPEN") {
      const opts = this.#getOptions(group);
      const elapsed = Date.now() - (bucket.openedAt ?? 0);
      if (elapsed >= opts.openDurationMs) {
        return "HALF_OPEN";
      }
    }

    return bucket.state;
  }

  /**
   * Gets the number of failures in the current window for a URL.
   *
   * @param url - The URL to check
   * @returns The failure count
   */
  getFailureCount(url: string): number {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#buckets.get(group);
    if (!bucket) return 0;

    const opts = this.#getOptions(group);
    this.#cleanupFailures(bucket, opts.failureWindowMs);
    return bucket.failures.length;
  }

  /**
   * Gets the time since the circuit opened for a URL.
   *
   * @param url - The URL to check
   * @returns Time in ms since circuit opened, or null if not open
   */
  getTimeSinceOpen(url: string): number | null {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#buckets.get(group);
    if (!bucket || bucket.openedAt === null) return null;
    return Date.now() - bucket.openedAt;
  }

  /**
   * Gets the time remaining before the circuit transitions to HALF_OPEN.
   *
   * @param url - The URL to check
   * @returns Time in ms until HALF_OPEN, or null if not applicable
   */
  getTimeUntilHalfOpen(url: string): number | null {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#buckets.get(group);
    if (!bucket || bucket.state !== "OPEN" || bucket.openedAt === null) {
      return null;
    }

    const opts = this.#getOptions(group);
    const elapsed = Date.now() - bucket.openedAt;
    const remaining = opts.openDurationMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Manually resets (closes) the circuit for a URL or all circuits.
   *
   * @param url - Optional URL to reset. If omitted, resets all circuits.
   */
  reset(url?: string): void {
    if (url !== undefined) {
      const group = this.#options.getGroupFunc(url);
      const bucket = this.#buckets.get(group);
      if (bucket) {
        this.#transitionTo(group, bucket, "CLOSED");
      }
    } else {
      // Reset all
      for (const [group, bucket] of this.#buckets) {
        this.#transitionTo(group, bucket, "CLOSED");
      }
    }
  }

  /**
   * Manually trips (opens) the circuit for a URL.
   *
   * @param url - The URL to trip the circuit for
   */
  trip(url: string): void {
    const group = this.#options.getGroupFunc(url);
    const bucket = this.#getBucket(group);
    this.#transitionTo(group, bucket, "OPEN");
  }

  /**
   * Sets options for a specific group.
   *
   * @param group - The group name
   * @param options - The options to set
   */
  setGroupOptions(group: string, options: GroupCircuitBreakerOptions): void {
    this.#groupOptions.set(group, options);
  }
}

/**
 * Groups URLs by their domain (hostname).
 * Useful for per-domain circuit breakers.
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   getGroupFunc: groupByDomain,
 * });
 * ```
 */
export function groupByDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
