# @gtbuchanan/tooling

Shared build configuration monorepo. Individual packages for ESLint,
TypeScript, Vitest configuration, and a shared build CLI.

## Structure

```text
README.md              — Consumer-facing documentation
skills-npm.config.ts   — Agent targets for `skills-npm` (claude-code, codex, github-copilot)
.github/
  actions/
    pnpm-resolve-pinned/ — Composite action: resolve locked version without install
    pnpm-tasks/          — Composite action: install pnpm, cache, install deps
    turbo-run/           — Composite action: run turbo task, skip install on cache hit
  workflows/
    cd.yml               — Calls CI, then version + publish on main
    changeset-check.yml  — Verify changeset exists on PR
    ci.yml               — Build + slow + e2e + coverage (PR + reusable)
    pre-commit.yml       — Run prek hooks on PR changed files
    pre-commit-seed.yml  — Seed prek cache on push to main
packages/
  cli/                          — @gtbuchanan/cli (gtb build CLI for consumers)
    skills/                     — Authored Agent Skills deployed by `gtb task deploy:skills`
  eslint-config/                — @gtbuchanan/eslint-config (ESLint configure())
  eslint-plugin-markdownlint/   — @gtbuchanan/eslint-plugin-markdownlint (markdownlint via ESLint)
  eslint-plugin-yamllint/       — @gtbuchanan/eslint-plugin-yamllint (yamllint gap rules via ESLint)
  tsconfig/                     — @gtbuchanan/tsconfig (shared base tsconfig.json)
  vitest-config/                — @gtbuchanan/vitest-config (configurePackage, configureGlobal, + e2e variants)
  test-utils/                   — private shared E2E fixture utilities
```

## Published-package behavior

Package-specific conventions ship as Agent Skills under each package's
`skills/` directory, discovered by coding agents via `skills-npm` in
consumer repos. Authored in this repo; deployed locally via `gtb task
deploy:skills` for dogfooding.

- **`gtb-build-pipeline`** (`@gtbuchanan/cli`) — Turborepo task graph,
  `gtb sync` / `gtb verify` / `gtb pipeline`, consumer script
  customization, test-bucket strategy, aggregate semantics

Packages without skills yet (vitest-config, eslint-config,
eslint-plugin-markdownlint, eslint-plugin-yamllint, tsconfig, test-utils)
keep their conventions in the sections below until those skills are
authored.

## Architecture

### Vitest config API

Per-package Vitest configuration using `configurePackage()` from
`@gtbuchanan/vitest-config`. Each package has its own `vitest.config.ts`
that calls `configurePackage()` to set up path aliases, test includes,
coverage, setupFiles, and mock reset.

- Unit: `configurePackage` / `configureGlobal`
- Slow tag: `configureGlobal` defines a `slow` tag (300s timeout).
  Customize via `configureGlobal({ slow: { timeout: 600_000 } })`
- E2E: `configureEndToEndPackage` / `configureEndToEndGlobal`

### Per-package tool configs

- **ESLint** — Per-package `eslint.config.ts` importing `configure()`
  from `@gtbuchanan/eslint-config`. ESLint caching enabled via
  `--cache --cache-location dist/.eslintcache`.
- **Vitest** — Per-package `vitest.config.ts` using `configurePackage()`
  from `@gtbuchanan/vitest-config/configure`.

### Linter

- **ESLint** — Primary linter and formatter. `typescript-eslint`
  strictTypeChecked + stylisticTypeChecked presets, `eslint-plugin-unicorn`
  (recommended), `eslint-plugin-promise`, `eslint-plugin-regexp` (regex
  safety), `eslint-plugin-jsdoc` (JSDoc/TSDoc validation),
  `@stylistic/eslint-plugin` (JS/TS formatting), `eslint-plugin-format`
  (Prettier formatting for JSON, Markdown, YAML, CSS, XML via ESLint
  rules), `@eslint-community/eslint-plugin-eslint-comments`,
  `eslint-plugin-import-x` (ordering), `@eslint/json` (JSON linting),
  `eslint-plugin-pnpm` (workspace validation), `eslint-plugin-n` (Node.js
  rules), `eslint-plugin-yml` (YAML linting + key sorting),
  `eslint-plugin-yamllint` (yamllint gap rules: truthy, octal-values,
  anchors, document-start/end),
  `eslint-plugin-markdownlint` (Markdown structural linting),
  `@vitest/eslint-plugin` (test rules), and `eslint-plugin-only-warn`
  (downgrades errors to warnings).

### Formatter

- **Prettier (via eslint-plugin-format)** — Formats non-JS/TS files
  (JSON, Markdown, YAML, CSS/SCSS/Less, XML) through ESLint rules.
  JS/TS formatting is handled by `@stylistic/eslint-plugin`. Prettier
  plugins (`prettier-plugin-sort-json`, `prettier-plugin-multiline-arrays`,
  `prettier-plugin-packagejson`, `prettier-plugin-css-order`,
  `@prettier/plugin-xml`) are resolved as `file://` URLs from this
  package's dependencies for reliable resolution under pnpm strict
  hoisting.

### Pre-commit hooks

- **prek** — Rust-based pre-commit hook manager (drop-in replacement for
  Python pre-commit). Installed automatically via `prepare` script on
  `pnpm install`. Hooks defined in `.pre-commit-config.yaml`:
  - `pre-commit-hooks` — file hygiene (large files, EOF newlines, BOM, trailing whitespace, no commit to branch)
  - `eslint` — linting, formatting, and Markdown structural checks with `--fix`

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
backed by `gtb` leaf commands. `ci.yml` also accepts workflow inputs
(`run-e2e`, `run-slow-tests`) for toggling test tiers.

- **`ci.yml`** — Build, slow tests, e2e tests, and coverage merging.
  All jobs use `turbo-run` to skip `pnpm install` on full cache hits.
  Inputs: `run-e2e` (default `true`), `run-slow-tests` (default `false`).
  Uploads artifacts: `packages` (e2e tarballs) and `coverage` (final
  report). When `run-slow-tests` is enabled, fast and slow coverage are
  merged in a separate `coverage` job.
- **`cd.yml`** — Calls CI, then runs version (changesets) and publish
  (npm trusted publishing via OIDC). Publish uses `turbo-run` for pack.
- **`changeset-check.yml`** — Verifies a changeset exists on every PR.
  Use `pnpm changeset --empty` for PRs that don't need a version bump.
- **`pre-commit.yml`** — Runs prek hooks against PR changed files.
- **`pre-commit-seed.yml`** — Warms the prek hook environment cache so
  PR builds get cache hits.

Composite actions:

- **`turbo-run`** — Runs a turbo task, skipping `pnpm install` when
  turbo remote cache covers all tasks. Resolves the locked turbo version,
  dry-runs to check cache status, then either restores from cache or
  falls back to full install. Used by all CI jobs.
- **`pnpm-tasks`** — Sets up pnpm and Node.js (version from
  `package.json` engines), caches store, installs dependencies, and
  runs optional pnpm commands. Used by non-turbo jobs (config-check,
  pre-commit).
- **`pnpm-resolve-pinned`** — Resolves a package's exact version from the
  lockfile without install. Used to pin `pnpm dlx` invocations to the
  locked version.

### Vitest usage specifics

Slow tests use Vitest's native tag system (`test('name', { tags: ['slow'] }, ...)`
or `/** @module-tag slow */`). The `--tags-filter` CLI option controls
which tests run (`!slow` for fast, `slow` for slow-only, omit for all).

Custom tags via `configureGlobal({ tags: [{ name: 'db', timeout: 60_000 }] })`.
Filter with `pnpm exec vitest run --tags-filter="!db"` (run vitest directly
for custom filter expressions; `gtb` commands only handle the `slow` tag).

Consumer directory conventions:

- `test/` — source tests (unit + integration). Coverage via source config.
- `e2e/` — artifact tests. No source coverage. Needs tarballs from pack.

Task-graph and bucket-table details moved to the `gtb-build-pipeline`
skill.

## Conventions

- All lint violations report as warnings in IDEs (not errors) so TypeScript
  diagnostics stand out. CI enforces via `--max-warnings=0`.
- Inline suppressions require a `--` reason suffix.
- Markdown structural rules (`markdownlint/lint`) use markdownlint's
  own comment syntax for per-rule suppression, not ESLint comments:
  `<!-- markdownlint-disable-next-line MD024 -->`. This keeps the
  plugin compatible with standalone markdownlint usage.
- All exported functions, types, interfaces, and constants must have JSDoc comments.
- When adding or removing a package, update the packages table in
  `README.md`, the structure tree above, and the linter/formatter
  sections as applicable.
- When asserting on `CommandResult` (exit code, stdout, stderr), use
  `expect(result).toMatchObject({ exitCode: 0 })` instead of
  `expect(result.exitCode).toBe(0)`. On failure, `toMatchObject` shows
  the full result object (including stderr) in the diff, making failures
  self-diagnosing.

## Versioning

Every PR requires a changeset — CI enforces this. Create a `.changeset/<name>.md`
file with YAML frontmatter listing affected packages and bump types:

```markdown
---
'@gtbuchanan/eslint-config': patch
---

Fix rule conflict
```

For PRs that don't affect published packages, create an empty changeset
(no packages in frontmatter):

```markdown
---
---

Update CI workflow
```
