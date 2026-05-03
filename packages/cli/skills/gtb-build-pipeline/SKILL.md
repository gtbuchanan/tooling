---
name: gtb-build-pipeline
description: Build pipeline guidance for projects using @gtbuchanan/cli. Covers the Turborepo task graph, gtb sync and verify, the gtb turbo wrapper (with the Android/Termux escape hatch), consumer script customization, and test-bucket strategy. Trigger keywords - @gtbuchanan/cli, @gtbuchanan/pnpm-termux-shim, turbo.json, gtb sync, gtb verify, gtb turbo, gtb task, compile:ts, pack:npm, deploy:skills, task graph.
---

# @gtbuchanan/cli build pipeline

Turborepo-based build pipeline orchestrated by the `gtb` CLI. Each package defines leaf-task scripts in `package.json`; Turborepo handles dependency ordering, caching, and parallelism.

## Orchestration

Root `package.json` scripts are thin aliases that route through the
`gtb turbo` wrapper:

- `pnpm check` → `gtb turbo run check`
- `pnpm build` → `gtb turbo run build`
- `pnpm build:ci` → `gtb turbo run build:ci`
- `pnpm pack` → `gtb turbo run pack`
- `pnpm test:slow` → `gtb turbo run test:slow`
- `pnpm test:e2e` → `gtb turbo run test:e2e`
- `pnpm coverage:merge` → `gtb turbo run coverage:merge`
- `pnpm deploy:skills` → `gtb turbo run deploy:skills` (monorepos only)

`gtb turbo` is a thin pass-through to `turbo` on every supported
platform. On Android (`process.platform === 'android'`) it resolves
the matching `@turbo/linux-<arch>` binary and execs it directly,
bypassing turbo's launcher (which rejects the platform upfront). See
[Android-Termux setup](#android-termux-setup) below.

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

`deploy:skills` keys on `skills/**` and `skills-npm.config.ts` only. If you install or remove an agent and want existing skills resymlinked into the new agent's project-local dir, run `gtb turbo run deploy:skills --force` once — turbo's cache otherwise reports HIT and skips the redeploy.

## `gtb sync` and `gtb verify`

`gtb sync` reconciles generated state:

- `turbo.json` tasks + aggregates
- per-package `tsconfig.json` / `tsconfig.build.json`
- per-package `package.json` scripts
- root `package.json` scripts
- `codecov.yml` flags + components

Run after adding packages, changing the task graph, or updating tooling. Without `--force`, existing script values are preserved — this is how packages keep custom overrides. Use `--force` only when intentionally resetting scripts to their generated defaults.

`gtb verify` validates no drift from the expected baseline. Exits non-zero if anything is out of sync. Run in CI as a drift gate. Use `--ignore <name>` to skip a specific task or script — prefer fixing the drift.

## Android-Termux setup

Two issues are caused by Termux's Node reporting `process.platform === 'android'`; a third (memory pressure) is unrelated and applies to any low-memory host. Native Android support upstream was declined in [vercel/turborepo#5616](https://github.com/vercel/turborepo/issues/5616), so `gtb turbo` ships the workaround instead.

**1. Turbo platform binary missing.** pnpm filters `@turbo/<os>-<arch>` optional dependencies by host platform; none target `android`, so all six are skipped on install. Widen the whitelist in the per-user pnpm rc:

```text
# ~/.config/pnpm/rc
supported-architectures.os[]=current
supported-architectures.os[]=linux
```

Then `pnpm install --force` from the workspace root. The Linux binary lands in `node_modules/.pnpm/turbo@<v>/node_modules/@turbo/linux-<arch>/`. `gtb turbo` resolves it via `require.resolve` from inside `node_modules/turbo/bin/turbo` (mirroring how the launcher itself looks up its platform package under pnpm strict layout) and execs it directly. The launcher's android-platform check is bypassed entirely; no `TURBO_BINARY_PATH` env var.

**2. Turbo child-process spawn ENOENT.** The Linux turbo binary is glibc-built, but Termux is Bionic. Termux's `LD_PRELOAD=libtermux-exec-ld-preload.so` rewrites `/usr/bin/env` shebangs in `execve` syscalls — but the preload is Bionic-only, so it never loads into the glibc turbo. When turbo spawns `pnpm`, the kernel sees `#!/usr/bin/env node` and fails because Termux has no `/usr/bin/env`.

Fixed by `@gtbuchanan/pnpm-termux-shim` — an `os: ["android"]`-filtered package whose `bin: { pnpm: ... }` entry has an absolute-path shebang. pnpm symlinks it into `<rootDir>/node_modules/.bin/pnpm`, which is first in `pnpm exec` PATH, so turbo's child-spawn resolves it ahead of the broken system pnpm. On non-Android hosts the package is skipped at install — zero footprint.

Add it as an `optionalDependencies` entry on the workspace root (so the bin lands in the root's `node_modules/.bin`, not nested under a transitive dep):

```jsonc
{
  "optionalDependencies": {
    "@gtbuchanan/pnpm-termux-shim": "^0.1.0",
  },
}
```

**3. Memory-bound concurrency for heavy aggregates.** Unrelated to `process.platform`: phones typically have 2–4GB free RAM under load. Turbo's default `--concurrency=10` is fine for `check` (typecheck + lint + fast tests fan out narrowly under the dependency graph). It is **not** fine for `build`, `test:slow`, or `test:e2e`, which fork their own vitest worker pools per task — `--concurrency=2` already crashed the OS in measurement. Run heavy aggregates with `--concurrency=1` on memory-constrained devices:

```sh
pnpm build --concurrency=1
pnpm test:slow --concurrency=1
pnpm test:e2e --concurrency=1
```

`gtb turbo` does not auto-set this — the right ceiling depends on which aggregate you're running and on free memory at invocation time, neither of which the wrapper can predict. Same applies to any low-memory host (small CI runners, etc.), not just Termux.

If your host _always_ needs this (e.g., a Termux dev machine, a tight CI runner), encode it as a project rule in always-loaded agent context (`AGENTS.md`, `CLAUDE.md`, repo memory, etc.) rather than relying on discretionary skill activation. Skills load body-on-trigger, but operational rules that must fire every session belong in the system prompt.

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
