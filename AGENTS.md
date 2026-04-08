# @gtbuchanan/tooling

Shared build configuration monorepo. Individual packages for ESLint, oxfmt,
oxlint, TypeScript, and Vitest configuration.

## Structure

```text
README.md              — Consumer-facing documentation
.github/
  actions/
    pnpm-resolve-pinned/ — Composite action: resolve locked version without install
    pnpm-tasks/          — Composite action: install pnpm, cache, install deps
  workflows/
    cd.yml               — Calls CI, then version + publish on main
    changeset-check.yml  — Verify changeset exists on PR
    ci.yml               — Build + e2e (PR + reusable)
    pre-commit.yml       — Run prek hooks on PR changed files
    pre-commit-seed.yml  — Seed prek cache on push to main
packages/
  eslint-config/       — @gtbuchanan/eslint-config (ESLint configure())
  markdownlint-config/ — @gtbuchanan/markdownlint-config (markdownlint configure())
  oxfmt-config/        — @gtbuchanan/oxfmt-config (oxfmt configure())
  oxlint-config/       — @gtbuchanan/oxlint-config (oxlint configure())
  tsconfig/            — @gtbuchanan/tsconfig (shared base tsconfig.json)
  vitest-config/       — @gtbuchanan/vitest-config (configure, configureGlobal, configureProject, + e2e variants)
  test-utils/          — private shared E2E fixture utilities
scripts/
  prepack.ts — Prepares clean package.json for each package's dist/source
  pack-all.ts — Runs pnpm pack across all packages
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
variants. Per-project configures path aliases and test includes. Global
configures coverage, setupFiles, and mock reset. Combined composes both
layers for single-project consumers. See JSDoc on each export for details
and options.

- Unit: `configureProject` / `configureGlobal` / `configure`
- E2E: `configureEndToEndProject` / `configureEndToEndGlobal` / `configureEndToEnd`

### Linters

Dual-linter setup:

- **oxlint** — Primary linter. All categories at `warn` + `denyWarnings`.
  Uses `@stylistic/eslint-plugin` via the jsPlugin loader for syntax-aware
  formatting.
- **ESLint** — Supplementary. `@eslint/json` (JSON linting),
  `eslint-plugin-pnpm` (workspace validation), `eslint-plugin-n` (Node.js
  rules not in oxlint), `eslint-plugin-yml` (YAML linting + key sorting),
  `@vitest/eslint-plugin` (test rules), `typescript-eslint` (type-aware
  linting), and `eslint-plugin-only-warn` (downgrades errors to warnings).
  `eslint-plugin-oxlint` disables overlapping rules — must be last in config.

### Formatter

- **oxfmt** — Formats non-JS/TS files (JSON, Markdown, YAML, etc.).
  JS/TS files are ignored via `ignorePatterns` because `@stylistic` handles
  formatting through oxlint.

### Markdown linter

- **markdownlint-cli2** — Structural linting for Markdown files.
  `@gtbuchanan/markdownlint-config` extends `markdownlint/style/prettier` to
  disable rules that conflict with oxfmt formatting.

### Pre-commit hooks

- **prek** — Rust-based pre-commit hook manager (drop-in replacement for
  Python pre-commit). Installed automatically via `prepare` script on
  `pnpm install`. Hooks defined in `.pre-commit-config.yaml`:
  - `pre-commit-hooks` — file hygiene (large files, EOF newlines, BOM, trailing whitespace, no commit to branch)
  - `markdownlint-cli2` — Markdown linting with `--fix`
  - `oxfmt` — JSON/Markdown/YAML formatting (local system hook)

### CI/CD workflows

All workflows are reusable via `workflow_call` and run directly in this
repo. Consuming repos call them with thin wrappers:

```yaml
# Example: consuming-repo/.github/workflows/cd.yml
on:
  push:
    branches: [main]
jobs:
  cd:
    uses: gtbuchanan/tooling/.github/workflows/cd.yml@main
```

Repo-specific behavior is customized through `package.json` scripts
(`build:ci`, `test:e2e`, etc.), not workflow inputs.

- **`ci.yml`** — Build and e2e tests. Uploads two artifacts: `source`
  (prepared `publishConfig.directory` contents for publish) and `packages`
  (tarballs for e2e tests).
- **`cd.yml`** — Calls CI, then runs version (changesets) and publish
  (npm trusted publishing via OIDC).
- **`changeset-check.yml`** — Verifies a changeset exists on every PR.
  Use `pnpm changeset --empty` for PRs that don't need a version bump.
- **`pre-commit.yml`** — Runs prek hooks against PR changed files.
- **`pre-commit-seed.yml`** — Warms the prek hook environment cache so
  PR builds get cache hits.

Composite actions:

- **`pnpm-tasks`** — Sets up pnpm and Node.js (version from
  `package.json` engines), caches store, installs dependencies, and
  runs optional pnpm commands.
- **`pnpm-resolve-pinned`** — Resolves a package's exact version from the
  lockfile without install. Used to pin `pnpm dlx` invocations to the
  locked version.

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
pnpm build:ci # build without e2e (used in CI, e2e runs as separate job)
pnpm lint     # oxlint && eslint
pnpm test     # vitest (unit tests via projects)
pnpm test:e2e # vitest (e2e tests, requires tarballs from pack)
```

## Versioning

Every PR requires a changeset — CI enforces this. Create a `.changeset/<name>.md`
file with YAML frontmatter listing affected packages and bump types:

```markdown
---
'@gtbuchanan/eslint-config': patch
---

Fix rule conflict with oxlint
```

For PRs that don't affect published packages, create an empty changeset
(no packages in frontmatter):

```markdown
---
---

Update CI workflow
```
