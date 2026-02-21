# Circuit Breaker

The circuit breaker pattern prevents cascading failures when an API goes down.
Instead of repeatedly hitting a failing service, the circuit breaker "opens" and
immediately rejects requests, giving the service time to recover.

## Why Use a Circuit Breaker?

Without a circuit breaker, when a service fails:

1. Every request waits for a timeout
2. Your app becomes slow and unresponsive
3. You waste resources on doomed requests
4. The failing service gets overwhelmed with retry attempts

With a circuit breaker:

1. After detecting failures, requests fail immediately
2. Your app stays responsive
3. The failing service gets breathing room
4. Recovery is detected automatically

## Circuit States

```
     ┌──────────────────────────────────────────────┐
     │                                              │
     ▼                                              │
┌─────────┐   failure threshold reached    ┌──────────┐
│ CLOSED  │ ──────────────────────────────►│   OPEN   │
│ (normal)│                                │ (failing)│
└─────────┘                                └──────────┘
     ▲                                          │
     │                                          │ after openDuration
     │                                          ▼
     │    success threshold reached     ┌────────────┐
     └──────────────────────────────────│ HALF_OPEN  │
                                        │ (testing)  │
                                        └────────────┘
                                              │
                                              │ failure in HALF_OPEN
                                              ▼
                                         back to OPEN
```

- **CLOSED**: Normal operation. Requests pass through, failures are tracked.
- **OPEN**: Circuit tripped. Requests immediately return 503 (Service
  Unavailable).
- **HALF_OPEN**: Testing recovery. Limited requests allowed to check if service
  recovered.

## Basic Usage

```ts
import { FetchClientProvider } from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");

provider.useCircuitBreaker({
  failureThreshold: 5, // Open after 5 failures
  openDurationMs: 30000, // Stay open for 30 seconds
  successThreshold: 2, // Close after 2 successes in HALF_OPEN
});

const client = provider.getFetchClient();

// Normal requests
const response = await client.getJSON("/users");

// If the API starts failing (5xx errors), after 5 failures:
// - Circuit opens
// - Subsequent requests get 503 immediately (no network call)
// - After 30 seconds, circuit enters HALF_OPEN
// - If test requests succeed, circuit closes
```

## Per-Domain Circuit Breaker

Each domain gets its own circuit breaker, so one failing service doesn't affect
others:

```ts
provider.usePerDomainCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
});

// api1 failing doesn't affect api2
await client.getJSON("https://api1.example.com/data"); // Circuit for api1
await client.getJSON("https://api2.example.com/data"); // Circuit for api2
```

## Configuration Options

```ts
provider.useCircuitBreaker({
  // When to open the circuit
  failureThreshold: 5, // Number of failures before opening (default: 5)
  failureWindowMs: 60000, // Time window for counting failures (default: 60000)

  // Recovery
  openDurationMs: 30000, // Time to stay OPEN before testing (default: 30000)
  successThreshold: 2, // Successes needed to close circuit (default: 2)
  halfOpenMaxAttempts: 1, // Max concurrent test requests (default: 1)

  // What counts as failure
  isFailure: (response) => response.status >= 500,
});
```

## What Counts as a Failure?

By default, these are treated as failures:

- HTTP 5xx responses (server errors)
- HTTP 429 responses (rate limited)
- Network errors (connection refused, timeout, etc.)

Customize failure detection:

```ts
provider.useCircuitBreaker({
  isFailure: (response) => {
    // Only count 5xx as failures
    return response.status >= 500;
  },
});

// Or be more aggressive
provider.useCircuitBreaker({
  isFailure: (response) => {
    // Count any non-2xx as failure
    return response.status < 200 || response.status >= 300;
  },
});
```

## Handling Open Circuit

### Return 503 Response (Default)

```ts
const response = await client.getJSON("/users");

if (response.status === 503) {
  // Circuit is open - show cached data or error message
  const retryAfter = response.response?.headers.get("Retry-After");
  console.log(`Service unavailable. Retry after ${retryAfter} seconds`);
}
```

### Throw Error

```ts
import { CircuitOpenError } from "@foundatiofx/fetchclient";

provider.useCircuitBreaker({
  throwOnOpen: true,
});

try {
  await client.getJSON("/users");
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.log(`Circuit open for: ${error.group}`);
    console.log(`Retry after: ${error.retryAfter}ms`);
  }
}
```

## State Change Callbacks

Monitor circuit state changes:

```ts
provider.useCircuitBreaker({
  onStateChange: (from, to) => {
    console.log(`Circuit: ${from} → ${to}`);
    // Log to monitoring system
  },
  onOpen: (group) => {
    // Alert: Service is down
    alert(`Service ${group} is experiencing issues`);
  },
  onClose: (group) => {
    // Service recovered
    console.log(`Service ${group} has recovered`);
  },
  onHalfOpen: (group) => {
    // Testing recovery
    console.log(`Testing if ${group} has recovered...`);
  },
});
```

## Manual Circuit Control

Access the circuit breaker for manual control:

```ts
const breaker = provider.circuitBreaker!;

// Force open (e.g., during planned maintenance)
breaker.trip("https://api.example.com/users");

// Force close (e.g., after manual verification)
breaker.reset("https://api.example.com/users");

// Reset all circuits
breaker.reset();

// Check state
const state = breaker.getState("https://api.example.com/users");
console.log(state); // "CLOSED" | "OPEN" | "HALF_OPEN"

// Get failure count
const failures = breaker.getFailureCount("https://api.example.com/users");

// Time since circuit opened
const timeSinceOpen = breaker.getTimeSinceOpen("https://api.example.com/users");

// Time until HALF_OPEN
const timeUntilHalfOpen = breaker.getTimeUntilHalfOpen(
  "https://api.example.com/users",
);
```

## Combined with Rate Limiting

Use both patterns together:

```ts
// Rate limiter prevents overwhelming healthy APIs
provider.useRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
});

// Circuit breaker stops requests to failing APIs
provider.useCircuitBreaker({
  failureThreshold: 5,
});
```

**Order matters**: Rate limiting happens first. If you're rate limited, the
request never reaches the circuit breaker.

## Removing Circuit Breaker

```ts
provider.removeCircuitBreaker();
```

## Practical Example: Resilient API Client

```ts
import {
  CircuitOpenError,
  FetchClientProvider,
  RateLimitError,
} from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");

// Rate limit to stay under API limits
provider.usePerDomainRateLimit({
  maxRequests: 100,
  windowSeconds: 60,
  updateFromHeaders: true,
});

// Circuit breaker for resilience
provider.usePerDomainCircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 30000,
  onOpen: (group) => {
    // Could show a toast, log to monitoring, etc.
    console.warn(`Service degraded: ${group}`);
  },
});

const client = provider.getFetchClient();

async function fetchUser(id: string) {
  const response = await client.getJSON(`/users/${id}`);

  if (response.status === 503) {
    // Circuit is open - return cached data or placeholder
    return getCachedUser(id) ?? { id, name: "Unknown", offline: true };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.status}`);
  }

  return response.data;
}
```

## Circuit Breaker vs Rate Limiting

| Aspect       | Rate Limiter                | Circuit Breaker                           |
| ------------ | --------------------------- | ----------------------------------------- |
| **Purpose**  | Prevent overloading API     | Prevent cascading failures                |
| **Trigger**  | Request count exceeds limit | Failure count exceeds threshold           |
| **When**     | Before request              | After response                            |
| **Blocks**   | Excess requests             | All requests to failing service           |
| **Recovery** | Automatic after time window | State machine (OPEN → HALF_OPEN → CLOSED) |

Use both together for maximum resilience:

- Rate limiter keeps you within API limits
- Circuit breaker handles when things go wrong
