# @gtbuchanan/tooling

Shared build configuration monorepo. Individual packages for ESLint, oxfmt,
oxlint, TypeScript, Vitest configuration, and a shared build CLI.

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
    ci.yml               — Build + slow + e2e + coverage (PR + reusable)
    pre-commit.yml       — Run prek hooks on PR changed files
    pre-commit-seed.yml  — Seed prek cache on push to main
packages/
  cli/                 — @gtbuchanan/cli (gtb build CLI for consumers)
  eslint-config/       — @gtbuchanan/eslint-config (ESLint configure())
  markdownlint-config/ — @gtbuchanan/markdownlint-config (markdownlint configure())
  oxfmt-config/        — @gtbuchanan/oxfmt-config (oxfmt configure())
  oxlint-config/       — @gtbuchanan/oxlint-config (oxlint configure())
  tsconfig/            — @gtbuchanan/tsconfig (shared base tsconfig.json)
  vitest-config/       — @gtbuchanan/vitest-config (configure, configureGlobal, configureProject, + e2e variants)
  test-utils/          — private shared E2E fixture utilities
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
- Slow tag: `configureGlobal` defines a `slow` tag (300s timeout).
  Customize via `configureGlobal({ slow: { timeout: 600_000 } })`
- E2E: `configureEndToEndProject` / `configureEndToEndGlobal` / `configureEndToEnd`

### Build CLI

`@gtbuchanan/cli` provides the `gtb` binary with commands that orchestrate
the build pipeline. Consumers install it and delegate `package.json` scripts:

```json
{
  "scripts": {
    "build": "gtb build",
    "check": "gtb check",
    "lint": "gtb lint",
    "test": "gtb test"
  }
}
```

This repo dogfoods via a `gtb` package.json script that runs the CLI
source directly with `node --experimental-strip-types`, bypassing the
compiled bin entry to avoid a bootstrapping dependency.

Commands: `build`, `build:ci`, `check`, `compile`, `generate`, `lint`,
`lint:eslint`, `lint:oxlint`, `pack`, `prepare`, `test`, `test:fast`,
`test:slow`, `test:e2e`.

Parallel execution (lint, check, build:ci) uses concurrently's JS API
with grouped output and kill-on-failure. Single commands use cross-spawn.

Workspace detection for `pack` resolves `pnpm-workspace.yaml` packages
globs for monorepos, or falls back to single-package mode.

#### Hook system

The command registry uses a mutable `Record<string, CommandHandler>`
built in `createCommands(scripts)`. Leaf commands are registered first,
then composed commands whose closures capture the registry by reference.
A final phase wraps every entry with `resolveStep(scripts, name, handler)`
so that `gtb:<step>` scripts in the consumer's root `package.json`
replace defaults.

Because closures capture the registry object (not individual entries),
hook resolution at any level is respected at call time — composed
commands calling `registry['compile:ts']!([])` see the resolved version.

Parallel commands use `resolveParallelCommand` which substitutes
command strings. Default commands route through `gtb <step>` so that
sub-step hooks are honoured through the binary.

`generate` is a standalone leaf command (not in any pipeline). It runs
`pnpm -r --if-present run generate` for per-package code generation.

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

Repo-specific behavior is customized through `@gtbuchanan/cli` (`gtb`)
commands invoked from `package.json` scripts. `ci.yml` also accepts
workflow inputs (`run-e2e`, `run-slow-tests`) for toggling test tiers.

- **`ci.yml`** — Build, slow tests, e2e tests, and coverage merging.
  Inputs: `run-e2e` (default `true`), `run-slow-tests` (default `false`).
  Uploads artifacts: `source` (publish), `packages` (e2e tarballs),
  and `coverage` (final report). When `run-slow-tests` is enabled,
  fast and slow coverage are merged in a separate `coverage` job.
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

### Testing strategy

Three buckets across two axes — speed (fast vs slow) and target (source
vs artifact):

|          | Source (coverage, no pack) | Artifact (no coverage, needs pack) |
| -------- | -------------------------- | ---------------------------------- |
| **Fast** | Unit + fast integration    | —                                  |
| **Slow** | Testcontainers, etc.       | E2E (Playwright, CLI tools)        |

Commands:

| Command     | Bucket                | Coverage | Needs pack |
| ----------- | --------------------- | -------- | ---------- |
| `test:fast` | Fast source           | Yes      | No         |
| `test:slow` | Slow source           | Yes      | No         |
| `test:e2e`  | Artifact              | No       | Yes        |
| `test`      | test:fast + test:slow | Merged   | No         |

Pipeline:

```text
check   = compile → lint + test:fast (parallel)
build   = check → test:slow + pack (parallel) → test:e2e
buildCi = check → pack  (slow + e2e are separate CI jobs)
```

Vitest configs:

- `vitest.config.ts` — all source tests per package (coverage enabled)
- `vitest.config.e2e.ts` — artifact tests per package (no coverage)

Slow tests use Vitest's native tag system (`test('name', { tags: ['slow'] }, ...)`
or `/** @module-tag slow */`). The `--tags-filter` CLI option controls
which tests run (`!slow` for fast, `slow` for slow-only, omit for all).

CI coverage merging: both tiers write to `dist/coverage/` (separate
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
  diagnostics stand out. CI enforces via `denyWarnings` (oxlint) and
  `--max-warnings=0` (ESLint).
- Inline suppressions require a `--` reason suffix.
- All exported functions, types, interfaces, and constants must have JSDoc comments.
- When asserting on `CommandResult` (exit code, stdout, stderr), use
  `expect(result).toMatchObject({ exitCode: 0 })` instead of
  `expect(result.exitCode).toBe(0)`. On failure, `toMatchObject` shows
  the full result object (including stderr) in the diff, making failures
  self-diagnosing.

## Build

Run commands via the `gtb` script (not aliased to top-level scripts):

```sh
pnpm run gtb check      # compile → lint + test:fast (fast, use during development)
pnpm run gtb build      # full pipeline: check → test:slow + pack → test:e2e
pnpm run gtb build:ci   # build without slow/e2e (used in CI, separate jobs)
pnpm run gtb generate   # per-package code generation (standalone, not in pipelines)
pnpm run gtb lint       # oxlint && eslint
pnpm run gtb test       # vitest (fast + slow source tests)
pnpm run gtb test:fast  # vitest (fast source tests only)
pnpm run gtb test:slow  # vitest (slow source tests only, tagged slow)
pnpm run gtb test:e2e   # vitest (e2e tests, requires tarballs from pack)
```

Only `build:ci`, `test:e2e`, `test:slow`, and `prepare` have top-level
script aliases (required by CI workflows and pnpm lifecycle hooks).

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
