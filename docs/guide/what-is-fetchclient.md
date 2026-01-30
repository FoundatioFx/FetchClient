# What is FetchClient?

FetchClient is a tiny library that makes working with `fetch` delightful. It
provides:

- Typed JSON helpers: `getJSON`, `postJSON`, etc.
- A `FetchClient` class with middleware support
- Caching with TTL, tagging, and programmatic invalidation
- Rate limiting per domain
- Timeouts and AbortSignal support
- Helpful error handling with Problem Details

Use just the functions for small scripts, or the client for full apps.
