# AGENTS.md — FetchClient

Purpose: Help AI coding agents work productively in this repo. Keep it short,
concrete, and specific to FetchClient.

## 1) What this project is

- Multi-runtime (Node, Deno, Bun, browsers) JSON fetch client published to npm,
  with:
  - Typed responses (`FetchClientResponse<T>`)
  - Middleware pipeline
  - Response caching
  - Rate limiting (global and per-domain)
  - Provider-based global configuration and functional helpers

## 2) Codebase layout

- Public entries: `src/index.ts` (`.`) and `src/mocks/index.ts` (`./mocks`)
- Core client: `src/FetchClient.ts`
- Provider & globals: `src/FetchClientProvider.ts`, `src/DefaultHelpers.ts`
- Options & types: `src/RequestOptions.ts`, `src/FetchClientResponse.ts`,
  `src/ProblemDetails.ts`
- Utilities: `src/FetchClientCache.ts`, `src/RateLimiter.ts`,
  `src/RateLimitMiddleware.ts`, `src/LinkHeader.ts`, `src/ObjectEvent.ts`,
  `src/Counter.ts`
- Tests: `tests/*.test.ts` (Vitest via `vite-plus/test`)
- Tooling: Vite+ (`vp`), configured in `vite.config.ts`; pnpm workspace with
  `docs/` (VitePress)

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
- Errors: unexpected non-2xx throws `FetchClientError`; can be suppressed
  with `expectedStatusCodes`, `shouldThrowOnUnexpectedStatusCodes=false`, or
  `errorCallback` returning true.
- Timeout/abort: merges `AbortSignal.timeout(options.timeout)` with any provided
  `signal`.
- Caching: GET + `cacheKey` reads/writes via `FetchClientCache` (default TTL 60s
  unless `cacheDuration` provided). Optional `cacheTags` enable tag-based
  invalidation via `cache.deleteByTag(tag)`.
- Middleware order: `[provider.middleware, client.use(...), internal fetch]`.
- Loading events: instance and provider expose `loading` via counters.

## 4) Dev workflows (Vite+)

- Install: `vp install`
- Format, lint, and type check: `vp check` (`vp check --fix` to auto-fix)
- Run tests: `vp test` (integration tests hit real APIs)
- Build package: `vp pack` (emits `dist/`, regenerates `exports` in
  `package.json`, and runs publint and attw)
- Docs: `vp run docs:dev`, `vp run docs:build`

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

- Unexpected statuses throw `FetchClientError`; inspect `.status` and
  `.response.problem`. Malformed JSON in a 2xx throws
  `FetchClientDeserializationError`.
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
`tests/*.test.ts`. Keep middleware order and error semantics consistent.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
