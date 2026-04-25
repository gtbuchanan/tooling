---
name: gtb-build-pipeline
description: Build pipeline guidance for projects using @gtbuchanan/cli. Covers the Turborepo task graph, gtb sync and verify, gtb pipeline fallback, consumer script customization, and test-bucket strategy. Trigger keywords - turbo, turbo.json, gtb sync, gtb verify, gtb pipeline, build, compile:ts, pack:npm, check, task graph, deploy:skills, workspace scripts, CI build.
---

# @gtbuchanan/cli build pipeline

Turborepo-based build pipeline orchestrated by the `gtb` CLI. Each package defines leaf-task scripts in `package.json`; Turborepo handles dependency ordering, caching, and parallelism.

## Orchestration

Root `package.json` scripts are thin turbo aliases:

- `pnpm check` → `turbo run check`
- `pnpm build` → `turbo run build`
- `pnpm build:ci` → `turbo run build:ci`
- `pnpm pack` → `turbo run pack`
- `pnpm test:slow` → `turbo run test:slow`
- `pnpm test:e2e` → `turbo run test:e2e`
- `pnpm coverage:merge` → `turbo run coverage:merge`
- `pnpm deploy:skills` → `turbo run deploy:skills` (monorepos only)

`pnpm verify`, `pnpm prepare`, and `pnpm run gtb <cmd>` invoke the CLI directly.

## Task graph

Aggregate tasks exist only as `dependsOn` targets — no corresponding script:

```text
generate:* → generate → typecheck:ts, compile:ts, lint:eslint
typecheck:ts → typecheck → check
typecheck:ts → lint:eslint → lint → check
^compile:ts → test:vitest:fast → check
test:vitest:fast → test:vitest:slow → test:slow → build
compile:ts → pack:npm → pack → test:vitest:e2e → test:e2e → build
lint:eslint → deploy:skills → build
check + compile + pack → build:ci → build
```

Leaf tasks, per-package, run via `gtb task <name>`:

- `typecheck:ts` — TypeScript type checking
- `compile:ts` — TypeScript compilation to `dist/source/`
- `lint:eslint` — ESLint with cache + zero-warning threshold
- `pack:npm` — npm tarball creation (publishable packages only)
- `test:vitest:fast` — fast unit/integration tests with coverage
- `test:vitest:slow` — slow tests (testcontainers, etc.) with coverage
- `test:vitest:e2e` — e2e tests against packed tarballs, no coverage
- `test:vitest` — fast + slow (coverage merged)
- `coverage:vitest:merge` — merge fast + slow coverage blobs
- `coverage:codecov:upload` — upload merged coverage (CI only)
- `deploy:skills` — symlink authored Agent Skills to agent directories

Test tasks hash `CI` into their cache key (`env: ["CI"]` in `turbo.json`) so local and CI caches don't collide — Vitest uses different reporters and coverage settings under CI.

### Non-obvious dependencies

- **`lint:eslint` depends on `typecheck:ts`** — prevents confusing linter output from type errors. ESLint (via `typescript-eslint`) runs its own type resolution, so the dep isn't strictly required; consumers who prefer parallelism over cleaner output can remove it.
- **Test tasks don't depend on `typecheck:ts`** — parallelism wins.
- **`deploy:skills` depends on `lint:eslint` same-package (no `^`)** — catches broken frontmatter and markdown in `SKILL.md` before deploy. Skills are authored independently per package; there's no topological chain.
- **`build:ci` excludes `test:slow`, `test:e2e`, `deploy:skills`** — CI runs fast tests; slow/e2e run on full builds; CI has no agents to serve skills to.

`deploy:skills` keys on `skills/**` and `skills-npm.config.ts` only. If you install or remove an agent and want existing skills resymlinked into the new agent's project-local dir, run `turbo run deploy:skills --force` once — turbo's cache otherwise reports HIT and skips the redeploy.

## `gtb sync` and `gtb verify`

`gtb sync` reconciles generated state:

- `turbo.json` tasks + aggregates
- per-package `tsconfig.json` / `tsconfig.build.json`
- per-package `package.json` scripts
- root `package.json` scripts
- `codecov.yml` flags + components

Run after adding packages, changing the task graph, or updating tooling. Without `--force`, existing script values are preserved — this is how packages keep custom overrides. Use `--force` only when intentionally resetting scripts to their generated defaults.

`gtb verify` validates no drift from the expected baseline. Exits non-zero if anything is out of sync. Run in CI as a drift gate. Use `--ignore <name>` to skip a specific task or script — prefer fixing the drift.

## `gtb pipeline`

Fallback for platforms where Turborepo is unavailable (e.g., Android/Termux). Invokes a task's dependency tree sequentially without caching. Same task names as turbo: `gtb pipeline check`, `gtb pipeline build`, etc.

Not a substitute for turbo — no caching, no parallelism. Only use when turbo won't run.

## Customizing behavior

Consumers override behavior by replacing `package.json` script values. No hooks or plugin system.

To keep a custom script value:

1. Edit the script in `package.json`.
1. Run `gtb sync` — non-destructive by default, preserves existing values.
1. `gtb verify` still passes: the missing-script check flags absent required scripts, not different values.

To reset to generated defaults: `gtb sync --force`.

## Test strategy

Two axes — speed (fast vs slow) and target (source vs artifact):

|      | Source (coverage, no pack) | Artifact (no coverage, needs pack) |
| ---- | -------------------------- | ---------------------------------- |
| Fast | Unit + fast integration    | —                                  |
| Slow | Testcontainers, etc.       | E2E (Playwright, CLI tools)        |

Per-package configs:

- `vitest.config.ts` — source tests (coverage via `configurePackage()`)
- `vitest.config.e2e.ts` — artifact tests (no coverage)

Slow tests use Vitest's native tag system; `--tags-filter` controls which run. Full Vitest configuration lives in the `gtb-vitest` skill (not yet published).

CI coverage merging: per-package runs write to `dist/coverage/`. CI uploads fast and slow as separate artifacts; a merge job downloads both and runs `vitest --merge-reports` to produce the unified report.

## Aggregate semantics

New per-package tasks plug into aggregates via `dependsOn`. Pick the aggregate by scope:

- `check` — fast correctness checks. Runs on pre-commit. Put typecheck, lint, and fast tests here.
- `build:ci` — PR-suitable. Skips slow tests, e2e, and skill deploys.
- `build` — full local validation. Everything in `build:ci` plus `test:slow`, `test:e2e`, and `deploy:skills`.
