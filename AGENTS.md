# @gtbuchanan/tooling

Shared build configuration monorepo. Individual packages for ESLint, oxfmt,
oxlint, TypeScript, and Vitest configuration.

## Structure

```
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

Three-layer API in `@gtbuchanan/vitest-config` for unit tests:

- `configureProject(root?)` — Per-project settings (alias, includes, excludes).
- `configureGlobal(options?)` — Global-only settings (coverage, setupFiles,
  mockReset). When `projects` is provided, generates inline project entries.
- `configure(options?)` — Combined config for single-project consumers.

Parallel three-layer API for end-to-end tests:

- `configureEndToEndProject(root?)` — Per-project e2e settings (alias, `e2e/**` includes).
- `configureEndToEndGlobal(options?)` — Global e2e settings (coverage to
  `dist/coverage-e2e`, testTimeout). When `projects` is provided, generates
  inline project entries.
- `configureEndToEnd(options?)` — Combined e2e config for single-project consumers.

Shared options:

- `consoleFailTest?: boolean` (default `true`) — Include console-fail-test setup.
- `coverageDirs?: string[]` (default `['bin', 'scripts', 'src']`) — Directories
  to include in coverage. When `projects` is provided, patterns are generated
  for both per-project and root-level directories.
- `hasAssertions?: boolean` (default `true`) — Include hasAssertions setup.

Global options add: `{ projects?: string[] }` — glob patterns (e.g.,
`['packages/*']`) for auto-discovering project directories.

End-to-end options add: `{ testTimeout?: number }` (default `300_000`).

Shared utilities: `buildWorkspaceEntry(dir, configureFn)` builds an inline
project entry with `test.name` and `test.root` from a directory and config
factory. `resolveProjectDirs(patterns)` resolves glob patterns to directory
paths. `resolveCoverageInclude(projectPatterns?, dirs?)` builds coverage
include globs, scoping to project patterns when provided.

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
