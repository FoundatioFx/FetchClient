# Contributing

FetchClient uses [Vite+](https://viteplus.dev) for formatting, linting, type
checking, testing, and packaging. Install the
[`vp` CLI](https://viteplus.dev/guide/), then run `vp install` from the repo root.
It sets up Node.js, pnpm, dependencies, and the pre-commit hook.

## Development

- Format, lint, and type check: `vp check` (`vp check --fix` to auto-fix)
- Run tests: `vp test` (`vp test watch` for watch mode)
- Coverage: `vp test --coverage`
- Build the package: `vp pack`

Library code lives in `src/` and tests in `tests/`. All tooling is configured in
`vite.config.ts`.

## Docs

The docs site in `docs/` is part of the pnpm workspace:

- Dev: `vp run docs:dev`
- Build: `vp run docs:build`

## License

MIT © Foundatio
