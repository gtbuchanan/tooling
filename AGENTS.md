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
  vitest-config/   — @gtbuchanan/vitest-config (configure, configureGlobal, configureProject)
  test-utils/      — private shared E2E fixture utilities
scripts/
  prepare-publish.ts — Prepares clean package.json for each package
  pack-all.ts        — Runs pnpm pack across all packages
```

## Architecture

### Per-package vitest projects

Each package has its own `vitest.config.ts` using `defineProject(configureProject())`.
The root `vitest.config.ts` uses `configureGlobal()` with `projects: ['packages/*']`.

### Vitest config API

Three-layer API in `@gtbuchanan/vitest-config`:

- `configureProject(root?)` — Per-project settings (alias, includes). Used in
  monorepo per-package vitest configs via `defineProject()`.
- `configureGlobal(options?)` — Global-only settings (coverage, setupFiles,
  mockReset). Used in root `vitest.config.ts` via `defineConfig()`.
- `configure(options?)` — Combined config for single-project consumers.

Options: `{ consoleFailTest?: boolean, hasAssertions?: boolean }` (both default
`true`). Controls which setup files are included.

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
- Per-package `vitest.config.ts` files are type-checked via
  `tsconfig.root.json` in each package, referenced from the solution tsconfig.

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
