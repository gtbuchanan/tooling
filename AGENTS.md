# @gtbuchanan/tooling

Shared build configuration monorepo. Individual packages for ESLint,
TypeScript, Vitest configuration, and a shared build CLI.

## Structure

```text
README.md              — Consumer-facing documentation
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
  eslint-config/                — @gtbuchanan/eslint-config (ESLint configure())
  eslint-plugin-markdownlint/   — @gtbuchanan/eslint-plugin-markdownlint (markdownlint via ESLint)
  eslint-plugin-yamllint/       — @gtbuchanan/eslint-plugin-yamllint (yamllint gap rules via ESLint)
  tsconfig/                     — @gtbuchanan/tsconfig (shared base tsconfig.json)
  vitest-config/                — @gtbuchanan/vitest-config (configurePackage, configureGlobal, + e2e variants)
  test-utils/                   — private shared E2E fixture utilities
```

## Architecture

### Turborepo

Turborepo orchestrates the build pipeline via `turbo.json`. Each package
defines leaf task scripts in `package.json`; Turborepo handles dependency
ordering, caching, and parallelism.

- **Task graph** — `turbo.json` declares tasks and their `dependsOn`
  relationships. Aggregate tasks (`check`, `build`, `lint`) use the
  transit node pattern: they exist only as `dependsOn` targets with no
  corresponding script, so Turborepo resolves their dependencies without
  executing anything.
- **Consumer customization** — Consumers override behavior by replacing
  `package.json` script values. No hooks or plugin system.
- **`sync`** — Reconciles generated `turbo.json`, tsconfigs, per-package
  `package.json` scripts, and `codecov.yml` with the current workspace.
  Run after adding packages or changing the task graph. Without `--force`,
  existing script values are preserved — this is how packages keep custom
  overrides (e.g., `@gtbuchanan/tsconfig` uses a custom `compile:ts`
  script). Only use `--force` when you intentionally want to reset all
  scripts to their generated defaults.
- **`verify`** — Validates that generated `turbo.json`, per-package
  scripts, tsconfigs, and `codecov.yml` have not drifted from the
  expected state.

### Vitest config API

Per-package Vitest configuration using `configurePackage()` from
`@gtbuchanan/vitest-config`. Each package has its own `vitest.config.ts`
that calls `configurePackage()` to set up path aliases, test includes,
coverage, setupFiles, and mock reset.

- Unit: `configurePackage` / `configureGlobal`
- Slow tag: `configureGlobal` defines a `slow` tag (300s timeout).
  Customize via `configureGlobal({ slow: { timeout: 600_000 } })`
- E2E: `configureEndToEndPackage` / `configureEndToEndGlobal`

### Build CLI

`@gtbuchanan/cli` provides the `gtb` binary. User-invoked commands sit
at the root (`gtb verify`, `gtb sync`, `gtb pipeline`, `gtb prepare`);
leaf tool wrappers live under `gtb task <name>` for Turborepo to call
via generated `package.json` scripts.

Consumers install it and wire scripts in `package.json`:

```json
{
  "scripts": {
    "typecheck:ts": "gtb task typecheck:ts",
    "compile:ts": "gtb task compile:ts",
    "lint:eslint": "gtb task lint:eslint",
    "test:vitest": "gtb task test:vitest",
    "test:vitest:fast": "gtb task test:vitest:fast",
    "test:vitest:slow": "gtb task test:vitest:slow",
    "test:vitest:e2e": "gtb task test:vitest:e2e"
  }
}
```

This repo dogfoods via a `gtb` package.json script that runs the CLI
source directly with `node --experimental-strip-types`, bypassing the
compiled bin entry to avoid a bootstrapping dependency.

Root commands: `verify`, `sync`, `pipeline`, `prepare`.
Task leaves (under `gtb task <name>`): `typecheck:ts`, `compile:ts`,
`coverage:codecov:upload`, `coverage:vitest:merge`, `lint:eslint`,
`test:vitest`, `test:vitest:fast`, `test:vitest:slow`, `test:vitest:e2e`,
`pack:npm`.

Workspace detection for `pack` resolves `pnpm-workspace.yaml` packages
globs for monorepos, or falls back to single-package mode.

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

### Testing strategy

Three buckets across two axes — speed (fast vs slow) and target (source
vs artifact):

|          | Source (coverage, no pack) | Artifact (no coverage, needs pack) |
| -------- | -------------------------- | ---------------------------------- |
| **Fast** | Unit + fast integration    | —                                  |
| **Slow** | Testcontainers, etc.       | E2E (Playwright, CLI tools)        |

Commands:

| Command            | Bucket                  | Coverage | Needs pack |
| ------------------ | ----------------------- | -------- | ---------- |
| `test:vitest:fast` | Fast source             | Yes      | No         |
| `test:vitest:slow` | Slow source             | Yes      | No         |
| `test:vitest:e2e`  | Artifact                | No       | Yes        |
| `test:vitest`      | test:vitest:fast + slow | Merged   | No         |

Pipeline (Turborepo task graph):

```text
generate:* → generate → typecheck:ts, compile:ts, lint:eslint
typecheck:ts → typecheck → check
typecheck:ts → lint:eslint → lint → check
^compile:ts → test:vitest:fast → check
test:vitest:fast → test:vitest:slow → test:slow → build
compile:ts → pack:npm → pack → test:vitest:e2e → test:e2e → build
check + compile + pack → build:ci → build
```

Test tasks include `env: ["CI"]` so Turborepo hashes the `CI` environment
variable into the task cache key. This prevents local and CI caches from
colliding — Vitest uses different reporters and coverage settings in CI.

Lint tasks depend on `typecheck:ts` to prevent confusing linter output
from type errors. ESLint (with `typescript-eslint`) runs its own type
resolution, so the dependency is not strictly required — consumers who
prefer parallelism can remove it.
Test tasks do not depend on `typecheck:ts` to maximize parallelism.

Vitest configs:

- Per-package `vitest.config.ts` — source tests (coverage enabled via `configurePackage()`)
- Per-package `vitest.config.e2e.ts` — artifact tests (no coverage)

Slow tests use Vitest's native tag system (`test('name', { tags: ['slow'] }, ...)`
or `/** @module-tag slow */`). The `--tags-filter` CLI option controls
which tests run (`!slow` for fast, `slow` for slow-only, omit for all).

CI coverage merging: per-package runs write to `dist/coverage/` (separate
runners, no conflict). Fast and slow jobs upload as `coverage-fast`
and `coverage-slow` artifacts. A `coverage` job downloads both and
runs `vitest --merge-reports` to produce a unified report.

Consumer guidance:

- `test/` — source tests (unit + integration). Coverage via source config.
- `e2e/` — artifact tests. No source coverage. Needs tarballs from pack.
- Tag slow source tests with `slow` (via options or `@module-tag`).
- Add custom tags via `configureGlobal({ tags: [{ name: 'db', timeout: 60_000 }] })`.
  Filter with `pnpm exec vitest run --tags-filter="!db"` (run vitest directly
  for custom filter expressions; `gtb` commands only handle the `slow` tag).

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

## Build

Root scripts delegate to Turborepo:

```sh
pnpm check     # turbo run check
pnpm build:ci  # turbo run check compile:ts && pack
pnpm build     # turbo run check compile:ts test:vitest:slow && pack && test:e2e
```

On platforms where Turborepo is unavailable (e.g., Android/Termux), use
`pnpm pipeline <task>` instead (`gtb pipeline`). See the
[CLI package](packages/cli/README.md#usage) for details.

This repo dogfoods `gtb` via a package.json script that runs the CLI
source directly with `node --experimental-strip-types`.

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
