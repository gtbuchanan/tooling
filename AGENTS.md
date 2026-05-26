# @gtbuchanan/tooling

Shared build configuration monorepo. Individual packages for ESLint,
TypeScript, Vitest configuration, and a shared build CLI.

## Structure

```text
README.md              — Consumer-facing documentation
mise.toml              — Pin Node, pnpm, prek versions for local + CI
mise.lock              — Per-platform binary checksums + download URLs
.github/
  actions/
    mise-setup/          — Composite action: install + cache mise tools
    pnpm-resolve-pinned/ — Composite action: resolve locked version without install
    pnpm-tasks/          — Composite action: cache pnpm store, install deps
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
  eslint-plugin-agent-skills/   — @gtbuchanan/eslint-plugin-agent-skills (Agent Skills schema + rules)
  eslint-plugin-markdownlint/   — @gtbuchanan/eslint-plugin-markdownlint (markdownlint via ESLint)
  eslint-plugin-md-frontmatter/ — @gtbuchanan/eslint-plugin-md-frontmatter (Markdown frontmatter validation via JSON Schema)
  eslint-plugin-yamllint/       — @gtbuchanan/eslint-plugin-yamllint (yamllint gap rules via ESLint)
  pnpm-termux-shim/             — @gtbuchanan/pnpm-termux-shim (pnpm bin shim for Termux/Android, os: ["android"])
  tsconfig/                     — @gtbuchanan/tsconfig (shared base tsconfig.json)
  vitest-config/                — @gtbuchanan/vitest-config (configurePackage, configureGlobal, + e2e variants)
  test-utils/                   — private shared E2E fixture utilities + test-data builders
```

## Published-package behavior

Package-specific conventions ship as Agent Skills under each package's
`skills/` directory, discovered by coding agents via `skills-npm` in
consumer repos. Authored in this repo; deployed locally via `gtb task
deploy:skills` for dogfooding.

- **`gtb-build-pipeline`** (`@gtbuchanan/cli`) — Turborepo task graph,
  `gtb sync` / `gtb verify` / `gtb turbo` (with the Android/Termux
  escape hatch), consumer script customization, test-bucket strategy,
  aggregate semantics
- **`gtb-eslint-config`** (`@gtbuchanan/eslint-config`) — `configure()`
  API and options, pre-commit `createRequire` pattern, bundled plugin
  set, suppression conventions, two-plugin Markdown lint split,
  per-package vs. workspace-root config split

Packages without skills yet (vitest-config, eslint-plugin-markdownlint,
eslint-plugin-yamllint, tsconfig, test-utils) keep their conventions in
the sections below until those skills are authored.

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

- **ESLint** — Per-package `eslint.config.ts` calling `configure()`
  from `@gtbuchanan/eslint-config`. API surface, plugin set,
  suppression conventions, Markdown lint split, and the per-package
  vs. workspace-root config split (incl. `//#lint:eslint` generation)
  live in the `gtb-eslint-config` skill.
- **Vitest** — Per-package `vitest.config.ts` using `configurePackage()`
  from `@gtbuchanan/vitest-config/configure`.

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

Every job that needs Node, pnpm, or prek prepends `mise-setup`, which
installs the exact versions pinned in `mise.toml` / `mise.lock`. Tool
caching is owned by `mise-setup` (mise data dir) and `pnpm-tasks`
(pnpm store) separately so a single-tool bump in `mise.lock` only
re-downloads the changed binary.

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

- **`mise-setup`** — Restores the mise data dir with an arch-specific
  `restore-keys` fallback, installs missing tools via
  `jdx/mise-action` (with `cache: false` so we own the cache layer),
  and prunes unreferenced versions on inexact restore. Sets
  `MISE_LOCKED=1` so `mise install` fails on `mise.toml` ↔ `mise.lock`
  drift. Called as the first step of every job that needs mise tools.
- **`turbo-run`** — Runs a turbo task, skipping `pnpm install` when
  turbo remote cache covers all tasks. Resolves the locked turbo version,
  dry-runs to check cache status, and delegates to `pnpm-tasks` for the
  install path. Used by all CI jobs.
- **`pnpm-tasks`** — Restores the pnpm store from `actions/cache`,
  installs dependencies, runs optional pnpm commands, and prunes the
  store on inexact restore. Assumes `mise-setup` ran first.
- **`pnpm-resolve-pinned`** — Resolves a package's exact version from the
  lockfile without install. Used to pin `pnpm dlx` invocations to the
  locked version.

### Turbo cache miss on workspace edits

Source changes in any `packages/*` workspace fully invalidate every
task's cache across all packages — `Cached: 0 cached, N total` is
expected. Turbo 2.x mixes every file in every workspace package
reachable from root `package.json` deps/devDeps into
`hashOfInternalDependencies`, which salts every task hash. Our root
devDeps (`@gtbuchanan/cli`, `eslint-config`, `tsconfig`, `vitest-config`)
transitively reach all seven packages. Root-only edits (this doc,
`.github/`) still hit cache.

Consumers see our packages as external npm deps (lockfile-keyed), so
they're unaffected. See
[vercel/turborepo#8202](https://github.com/vercel/turborepo/pull/8202);
no config scopes this hash.

### Why turbo isn't in mise.toml

Turbo is a Rust binary and philosophically belongs alongside Node,
pnpm, and prek in `mise.toml`. We tried, reverted, and recorded the
reasoning here so the question doesn't get re-litigated:

- Mise's only registered backend for turbo is `npm:turbo` (no aqua /
  ubi / cargo fallback). Confirmed via `mise registry turbo`.
- Vercel ships turbo exclusively through npm. The latest release has
  no binary assets on GitHub Releases;
  [vercel/turborepo#5616](https://github.com/vercel/turborepo/issues/5616)
  (request for Android binaries) was closed as "not planned".
  [vercel/turborepo#12735](https://github.com/vercel/turborepo/pull/12735)
  is the live PR re-litigating that decision — if it (or anything
  like it) lands, upstream distribution shifts and this whole
  trade-off changes.
- mise's npm backend writes only `version` + `backend` to `mise.lock`
  — no per-platform integrity. `pnpm-lock.yaml` records per-platform
  integrity for `turbo` plus every `@turbo/<platform>-<arch>` optional
  dep. npm install verifies integrity at install time in both paths,
  so the practical cost of moving was losing the local audit trail
  rather than losing actual verification.

The forced consequence: `packageManager` in `package.json` is
required — turbo errors out with `Missing packageManager` during
workspace resolution. Rather than duplicate the pnpm pin in
`mise.toml`'s `[tools]`, we set
`idiomatic_version_file_enable_tools = ["pnpm"]` so mise reads the
version directly from the same `packageManager` field. One pin, two
consumers (turbo and mise). `mise.lock` still locks pnpm's
per-platform binaries via the aqua backend; only the version source
is shared.

The `TURBO_DANGEROUSLY_DISABLE_PACKAGE_MANAGER_CHECK` escape hatch
exists but turbo's own schema warns it disables some pnpm-aware
features; not worth taking on for marginal benefit.

Re-evaluate if:

- Vercel ships standalone binaries (would unblock an `aqua:` or
  `ubi:` backend with real per-platform integrity).
- mise's npm backend gains lockfile integrity for `npm:`-backed
  tools.
- Turbo ever ships an Agent Skill in its npm package — turbo would
  still need to live in the pnpm catalog so `skills-npm` can
  discover it, so the answer wouldn't change but the question is
  effectively settled.

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

ESLint conventions enforced by `@gtbuchanan/eslint-config` (warnings-only
in IDE / `--max-warnings=0` in CI, `--` reason suffix on suppressions,
JSDoc on exports, two-plugin Markdown lint split) live in the
`gtb-eslint-config` skill. Repo-local conventions:

- When adding or removing a package, update the packages table in
  `README.md` and the structure tree above.
- When asserting on `CommandResult` (exit code, stdout, stderr), use
  `expect(result).toMatchObject({ exitCode: 0 })` instead of
  `expect(result.exitCode).toBe(0)`. On failure, `toMatchObject` shows
  the full result object (including stderr) in the diff, making failures
  self-diagnosing.
- Generate incidental test data via
  `@gtbuchanan/test-utils/builders` (or `@faker-js/faker` directly for
  one-off primitives) and capture the result in a local so the
  assertion references the captured value, not a duplicate literal.
  Convention: `import * as build from '@gtbuchanan/test-utils/builders'`,
  then `const name = build.scopedPackageName()` and
  `expect(result).toHaveProperty('name', name)`. Only hard-code literals
  when the SUT branches on the specific string (reserved keys, known
  enum values). Add a builder when the value has a domain shape worth
  centralizing (scoped package name, semver range, GitHub URL, etc.);
  inline faker is fine for raw primitives where the shape is exactly
  what faker already returns. See `packages/cli/test/manifest.test.ts`
  for the reference pattern.

## Operational notes

- **Termux** — run `pnpm build`, `pnpm test:slow`, and `pnpm test:e2e`
  with `--concurrency=1` to avoid OOM. See the `gtb-build-pipeline`
  skill for why.

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
