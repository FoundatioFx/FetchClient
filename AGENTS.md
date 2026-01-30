# AGENTS.md — FetchClient

Purpose: Help AI coding agents work productively in this repo. Keep it short,
concrete, and specific to FetchClient.

## 1) What this project is

- Deno-first, multi-runtime JSON fetch client with:
  - Typed responses (`FetchClientResponse<T>`)
  - Middleware pipeline
  - Response caching
  - Rate limiting (global and per-domain)
  - Provider-based global configuration and functional helpers

## 2) Codebase layout

- Public entry: `mod.ts` (re-exports from `src/*.ts`)
- Core client: `src/FetchClient.ts`
- Provider & globals: `src/FetchClientProvider.ts`, `src/DefaultHelpers.ts`
- Options & types: `src/RequestOptions.ts`, `src/FetchClientResponse.ts`,
  `src/ProblemDetails.ts`
- Utilities: `src/FetchClientCache.ts`, `src/RateLimiter.ts`,
  `src/RateLimitMiddleware.ts`, `src/LinkHeader.ts`, `src/ObjectEvent.ts`,
  `src/Counter.ts`
- Tests: `src/*test.ts`
- Build tooling: `scripts/build.ts`, tasks in `deno.json`

## 3) How it works (architecture)

- Option merge order: provider defaults → client defaults → per-call options.
- JSON helpers (`getJSON|postJSON|putJSON|patchJSON|deleteJSON`): set Accept and
  stringify object bodies; parse JSON using optional `reviver` and
  `shouldParseDates`.
- URL building: `baseUrl` + relative path; `options.params` appended only if not
  already present in URL.
- Auth: if `accessTokenFunc()` returns a token, `Authorization: Bearer <token>`
  is added automatically.
- Model validation: if `modelValidator` is set and body is object
  (non-FormData), validate before fetch; returning `ProblemDetails`
  short-circuits the request.
- Errors: unexpected non-2xx throws the Response (augmented); can be suppressed
  with `expectedStatusCodes`, `shouldThrowOnUnexpectedStatusCodes=false`, or
  `errorCallback` returning true.
- Timeout/abort: merges `AbortSignal.timeout(options.timeout)` with any provided
  `signal`.
- Caching: GET + `cacheKey` reads/writes via `FetchClientCache` (default TTL 60s
  unless `cacheDuration` provided). Optional `cacheTags` enable tag-based
  invalidation via `cache.deleteByTag(tag)`.
- Middleware order: `[provider.middleware, client.use(...), internal fetch]`.
- Loading events: instance and provider expose `loading` via counters.

## 4) Dev workflows (Deno)

- Run tests (net allowed): `deno task test`
- Type check: `deno task check`
- Lint/format: `deno task lint`, `deno task format-check`
- Build npm package: `deno task build` (dnt emits to `npm/` CJS + `.d.ts`;
  copies `license` and `readme.md`)

## 5) Common tasks (examples)

- Get a client: `useFetchClient()` or `new FetchClient()` (inherits provider
  defaults)
- Global config: `setBaseUrl`, `setAccessTokenFunc`, `setModelValidator`,
  `useMiddleware`
- Rate limiting: `useRateLimit({ maxRequests, windowSeconds })` or
  `usePerDomainRateLimit(...)`
- GET cache:
  `client.getJSON(url, { cacheKey: ["todos","1"], cacheDuration: 60000 })`
- Cache with tags:
  `client.getJSON(url, { cacheKey: ["todos","1"], cacheTags: ["todos", "user:1"] })`
- Invalidate by tag: `client.cache.deleteByTag("todos")`
- Tolerate 404: `expectedStatusCodes: [404]` or handle via `errorCallback`

## 6) Conventions & gotchas

- Thrown values are Response objects; catch and inspect `.status` and `.problem`
  (not `Error`).
- `meta.links` parsed from `Link` header (`next`/`previous` may be present).
- Don’t break middleware order; provider middleware must run before client
  middleware.
- Keep JSON header behavior aligned with
  `buildJsonRequestOptions`/`buildRequestInit`.

### Code style

- Keep comments minimal. Comment only complex or non-obvious code paths.

## 7) Where to extend

- Add request features by threading through `RequestOptions` and merging in
  `FetchClient` like existing fields.
- Header-derived behaviors (pagination/limits): parse in internal fetch, enrich
  `response.meta`.
- Rate limit updates: `RateLimitMiddleware` already auto-updates from headers.

## 8) Pointers to read first

`src/FetchClient.ts`, `src/FetchClientProvider.ts`, `src/DefaultHelpers.ts`,
`src/RequestOptions.ts`, `src/FetchClientResponse.ts`, `src/RateLimiter.ts`,
`src/RateLimitMiddleware.ts`, `src/FetchClientCache.ts`, `src/LinkHeader.ts`.

---

If something is unclear, prefer small, additive changes and tests in
`src/*test.ts`. Keep middleware order and error semantics consistent.
