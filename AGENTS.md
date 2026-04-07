# @gtbuchanan/tooling

Shared build configuration monorepo. Individual packages for ESLint, oxfmt,
oxlint, TypeScript, and Vitest configuration.

## Structure

```text
packages/
  eslint-config/   — @gtbuchanan/eslint-config (ESLint configure())
  oxfmt-config/    — @gtbuchanan/oxfmt-config (oxfmt configure())
  oxlint-config/   — @gtbuchanan/oxlint-config (oxlint configure())
  tsconfig/        — @gtbuchanan/tsconfig (shared base tsconfig.json)
  vitest-config/   — @gtbuchanan/vitest-config (configure, configureGlobal, configureProject, + e2e variants)
  test-utils/      — private shared E2E fixture utilities
scripts/
  prepare-publish.ts — Prepares clean package.json for each package
  pack-all.ts        — Runs pnpm pack across all packages
```

## Architecture

### Vitest projects

The root `vitest.config.ts` uses `configureGlobal({ projects: ['packages/*'] })`
to auto-discover packages. Per-package `vitest.config.ts` files are not needed
unless a package requires custom settings — the global config generates inline
project entries via `configureProject()` for each directory. Directories with
their own `vitest.config.ts` are included as-is.

The root `vitest.config.e2e.ts` uses `configureEndToEndGlobal({ projects: ['packages/*'] })`
following the same pattern with `configureEndToEndProject()`.

### Vitest config API

Three-layer API in `@gtbuchanan/vitest-config` with parallel unit and e2e
variants. Per-project sets alias and includes. Global sets coverage,
setupFiles, and mock reset. Combined composes both for single-project
consumers. See JSDoc on each export for details and options.

- Unit: `configureProject` / `configureGlobal` / `configure`
- E2E: `configureEndToEndProject` / `configureEndToEndGlobal` / `configureEndToEnd`

### Linters

Dual-linter setup:

- **oxlint** — Primary linter. All categories at `warn` + `denyWarnings`.
  `@stylistic/eslint-plugin` via jsPlugin for syntax-aware formatting.
- **ESLint** — Supplementary. `eslint-plugin-pnpm` (needs JSON/YAML parsers
  oxlint can't load) and `eslint-plugin-n` (rules not in oxlint).
  `eslint-plugin-oxlint` disables overlapping rules. Must be last in config.

### Formatter

- **oxfmt** — Formats non-JS/TS files (JSON, Markdown, etc.).
  JS/TS files are ignored via `ignorePatterns` because `@stylistic` handles
  formatting through oxlint.

## Conventions

- All lint violations report as warnings in IDEs (not errors) so TypeScript
  diagnostics stand out. CI enforces via `denyWarnings` (oxlint) and
  `--max-warnings=0` (ESLint).
- Inline suppressions require a `--` reason suffix.
- All exported functions, types, interfaces, and constants must have JSDoc comments.

## Build

```sh
pnpm check    # compile → lint + test (fast, use during development)
pnpm build    # full pipeline including pack + e2e (slower, use before commit)
pnpm lint     # oxlint && eslint
pnpm test     # vitest (unit tests via projects)
pnpm test:e2e # vitest (e2e tests, requires tarballs from pack)
```

## Versioning

Uses changesets for per-package versioning. Each PR declares which packages
changed via `pnpm changeset`.
