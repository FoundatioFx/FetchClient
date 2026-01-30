# Error Handling

FetchClient provides flexible error handling with support for expected status codes, custom error callbacks, and RFC 7807 Problem Details.

## Default Behavior

By default, FetchClient throws an error for any non-2xx status code:

```ts
import { FetchClient } from "@foundatiofx/fetchclient";

const client = new FetchClient();

try {
  await client.getJSON("/api/not-found");
} catch (error) {
  console.log(error.message); // "404 Not Found"
}
```

## Expected Status Codes

Tell FetchClient which status codes are expected (won't throw):

```ts
const response = await client.getJSON("/api/resource", {
  expectedStatusCodes: [404, 410],
});

if (response.status === 404) {
  console.log("Resource not found - this is fine");
}
```

## Prevent All Throwing

Disable throwing entirely:

```ts
const response = await client.getJSON("/api/resource", {
  shouldThrowOnUnexpectedStatusCodes: false,
});

// Always returns response, never throws
if (!response.ok) {
  console.log("Request failed:", response.status);
}
```

## Custom Error Callback

Handle errors with custom logic:

```ts
const response = await client.getJSON("/api/resource", {
  errorCallback: (response) => {
    if (response.status === 404) {
      console.log("Not found - handling gracefully");
      return true; // Don't throw
    }

    if (response.status === 403) {
      window.location.href = "/login";
      return true; // Don't throw
    }

    // Return false/undefined to throw
    return false;
  },
});
```

## Throwing Custom Errors

```ts
const response = await client.getJSON("/api/resource", {
  errorCallback: (response) => {
    if (response.status === 404) {
      throw new NotFoundError("The resource was not found");
    }
    // Falls through to default error
  },
});
```

## Problem Details (RFC 7807)

When APIs return Problem Details format, FetchClient parses it automatically:

```ts
const response = await client.postJSON("/api/users", {
  email: "invalid",
});

if (!response.ok) {
  console.log(response.problem.title);   // "Validation Error"
  console.log(response.problem.detail);  // "The request was invalid"
  console.log(response.problem.status);  // 400
  console.log(response.problem.errors);  // { email: ["Invalid email format"] }
}
```

### Problem Details Structure

```ts
interface ProblemDetails {
  type?: string;      // URI identifying the problem type
  title?: string;     // Short human-readable summary
  status?: number;    // HTTP status code
  detail?: string;    // Detailed explanation
  instance?: string;  // URI identifying this occurrence
  errors?: Record<string, string[]>;  // Field-level errors
}
```

### Creating Problem Details

Use `ProblemDetails` for client-side validation:

```ts
import { ProblemDetails } from "@foundatiofx/fetchclient";

const problem = new ProblemDetails();
problem.title = "Validation Failed";
problem.status = 400;
problem.errors = {
  email: ["Email is required"],
  password: ["Password must be at least 8 characters"],
};
```

## Model Validation

Validate request data before sending:

```ts
import { setModelValidator, ProblemDetails } from "@foundatiofx/fetchclient";

setModelValidator(async (data) => {
  if (!data) return null;

  const problem = new ProblemDetails();
  const d = data as { email?: string; password?: string };

  if (!d.email) {
    problem.errors.email = ["Email is required"];
  }

  if (d.password && d.password.length < 8) {
    problem.errors.password = ["Password must be at least 8 characters"];
  }

  // Return problem if there are errors, null otherwise
  return Object.keys(problem.errors).length > 0 ? problem : null;
});

// Now validation runs before the request
const response = await client.postJSON("/api/users", {
  email: "",
  password: "123",
});

if (!response.ok) {
  console.log(response.problem.errors);
  // { email: ["Email is required"], password: ["Password must be at least 8 characters"] }
}
```

### With Zod

```ts
import { z } from "zod";
import { setModelValidator, ProblemDetails } from "@foundatiofx/fetchclient";

const UserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

setModelValidator(async (data) => {
  if (!data) return null;

  const result = UserSchema.safeParse(data);
  if (result.success) return null;

  const problem = new ProblemDetails();
  problem.title = "Validation Error";
  problem.status = 400;

  for (const error of result.error.errors) {
    const field = error.path.join(".");
    problem.errors[field] = problem.errors[field] || [];
    problem.errors[field].push(error.message);
  }

  return problem;
});
```

## Network Errors

Network errors (connection refused, DNS failure, etc.) throw `TypeError`:

```ts
try {
  await client.getJSON("https://nonexistent.example.com");
} catch (error) {
  if (error instanceof TypeError) {
    console.log("Network error:", error.message);
  }
}
```

## Timeout Errors

Timeout returns a 408 response or throws `DOMException`:

```ts
// Using FetchClient - returns 408 response
const response = await client.getJSON("/api/slow", { timeout: 5000 });
if (response.status === 408) {
  console.log("Request timed out");
}

// Using fetch directly with AbortSignal - throws DOMException
try {
  await fetch("/api/slow", { signal: AbortSignal.timeout(5000) });
} catch (error) {
  if (error.name === "TimeoutError") {
    console.log("Request timed out");
  }
}
```

## Circuit Breaker Errors

When circuit breaker is open:

```ts
import { CircuitOpenError } from "@foundatiofx/fetchclient";

provider.useCircuitBreaker({ throwOnOpen: true });

try {
  await client.getJSON("/api/data");
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.log(`Circuit open for ${error.group}`);
    console.log(`Retry after ${error.retryAfter}ms`);
  }
}

// Or check response status (default behavior)
const response = await client.getJSON("/api/data");
if (response.status === 503) {
  console.log("Service unavailable - circuit is open");
}
```

## Rate Limit Errors

```ts
import { RateLimitError } from "@foundatiofx/fetchclient";

try {
  await client.getJSON("/api/data");
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter}ms`);
  }
}
```

## Practical Example: Comprehensive Error Handler

```ts
import {
  FetchClient,
  FetchClientProvider,
  CircuitOpenError,
  RateLimitError,
} from "@foundatiofx/fetchclient";

const provider = new FetchClientProvider();
provider.setBaseUrl("https://api.example.com");
provider.useCircuitBreaker({ failureThreshold: 5 });
provider.useRateLimit({ maxRequests: 100, windowSeconds: 60 });

const client = provider.getFetchClient();

async function apiRequest<T>(
  url: string,
  options?: RequestOptions
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await client.getJSON<T>(url, {
      shouldThrowOnUnexpectedStatusCodes: false,
      ...options,
    });

    if (response.ok) {
      return { data: response.data, error: null };
    }

    // Handle specific status codes
    switch (response.status) {
      case 400:
        return {
          data: null,
          error: response.problem.detail || "Invalid request"
        };
      case 401:
        // Redirect to login
        window.location.href = "/login";
        return { data: null, error: "Please log in" };
      case 403:
        return { data: null, error: "You don't have permission" };
      case 404:
        return { data: null, error: "Not found" };
      case 503:
        return { data: null, error: "Service temporarily unavailable" };
      default:
        return { data: null, error: `Error: ${response.status}` };
    }
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      return { data: null, error: "Service is down. Please try again later." };
    }
    if (error instanceof RateLimitError) {
      return { data: null, error: "Too many requests. Please slow down." };
    }
    if (error instanceof TypeError) {
      return { data: null, error: "Network error. Check your connection." };
    }
    return { data: null, error: "An unexpected error occurred" };
  }
}

// Usage
const { data, error } = await apiRequest<User>("/users/123");
if (error) {
  showErrorToast(error);
} else {
  displayUser(data);
}
```
