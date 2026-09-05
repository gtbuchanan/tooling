---
name: gtb-build-pipeline
description: Build pipeline guidance for projects using @gtbuchanan/cli. Covers the Turborepo task graph, gtb sync and verify (including scoped runs), the gtb hk pre-commit runner, the gtb turbo wrapper (with the Android/Termux escape hatch), consumer script customization, and test-bucket strategy. Trigger keywords - @gtbuchanan/cli, @gtbuchanan/pnpm-termux-shim, turbo.json, gtb sync, gtb sync mise, gtb verify, gtb verify mise, gtb turbo, gtb task, gtb hk, hk:all, hk:base, mise.tasks.toml, compile:ts, pack:npm, deploy:skills, task graph, transit.
---

# @gtbuchanan/cli build pipeline

Turborepo-based build pipeline orchestrated by the `gtb` CLI. Each package defines leaf-task scripts in `package.json`; Turborepo handles dependency ordering, caching, and parallelism.

## Orchestration

In a **monorepo**, root `package.json` scripts are thin aliases that
route through the `gtb turbo` wrapper:

- `pnpm check` → `gtb turbo run check`
- `pnpm build` → `gtb turbo run build`
- `pnpm build:ci` → `gtb turbo run build:ci`
- `pnpm pack` → `gtb turbo run pack`
- `pnpm test:slow` → `gtb turbo run test:slow`
- `pnpm test:e2e` → `gtb turbo run test:e2e`
- `pnpm coverage:merge` → `gtb turbo run coverage:merge`
- `pnpm deploy:skills` → `gtb turbo run deploy:skills`

### Single-package repos have no aggregate aliases

When the root _is_ the lone package (no `packages` globs in
`pnpm-workspace.yaml`), `gtb sync` generates none of the scripts above —
invoke the aggregate directly instead:

```sh
gtb turbo run check
gtb turbo run build
```

Turbo runs these as root tasks and, finding no command for them, just
resolves their `dependsOn` chain down to the leaf scripts. Adding an
alias back breaks the repo: turbo resolves the aggregate to the root
script, the script re-invokes turbo, and turbo aborts the run with its
[`recursive_turbo_invocations`](https://turborepo.dev/messages/recursive-turbo-invocations)
guard. The loop is real, not a heuristic false positive, so no rewrite
of the alias escapes it — dispatching to the leaf tasks (`gtb turbo run
typecheck:ts lint:eslint`) trips the same guard, and a turbo-free alias
would run _in addition to_ the aggregate's dependencies. The leaf
scripts are unaffected: they call `gtb task <name>` and never turbo.

`gtb verify` reports any root script that shadows an aggregate, so a
repo synced before this rule landed is told which scripts to delete.

`gtb turbo` is a thin pass-through to `turbo` on every supported
platform. On Android (`process.platform === 'android'`) it resolves
the global turbo binary installed via Termux's package registry
(`$PREFIX/bin/turbo`) and execs it directly, bypassing the
node_modules launcher (which rejects the platform upfront). See
[Android-Termux setup](#android-termux-setup) below.

`pnpm verify`, `pnpm prepare`, and `pnpm run gtb <cmd>` invoke the CLI directly.

## Task graph

Aggregate tasks exist only as `dependsOn` targets — no corresponding script:

```text
generate:* → generate → typecheck:ts, compile:ts, lint:eslint
^transit → transit → typecheck:ts, lint:eslint, test:vitest:*
typecheck:ts → typecheck → check
typecheck:ts → lint:eslint → lint → check
^compile + transit → test:vitest:fast → check
^compile + transit → test:vitest:slow → test:slow → build
compile:ts → pack:npm → pack → test:vitest:e2e → test:e2e → build
lint:eslint → deploy:skills → build
check + compile + pack → build:ci → build
```

This is the maximal graph. Every node and edge above is capability-conditional — `gtb sync` emits only what the workspace's tools call for, so a workspace that publishes nothing gets no `^compile` edge on its test tasks (and no `compile:ts`, `pack:npm`, or `pack` at all), and one without ESLint gets no `lint:eslint`.

Leaf tasks, per-package, run via `gtb task <name>`:

- `typecheck:ts` — TypeScript type checking
- `compile:ts` — TypeScript compilation to `dist/source/`
- `lint:eslint` — ESLint with cache + zero-warning threshold
- `pack:npm` — npm tarball creation (publishable packages only); also copies
  the package `README.md` and its `LICENSE` (the package's own, else the
  workspace-root one) into `dist/source/` so the tarball ships them
- `test:vitest:fast` — fast unit/integration tests with coverage
- `test:vitest:slow` — slow tests (testcontainers, etc.) with coverage
- `test:vitest:e2e` — e2e tests against packed tarballs, no coverage
- `test:vitest` — fast + slow (coverage merged)
- `coverage:vitest:merge` — merge fast + slow coverage blobs
- `coverage:codecov:upload` — upload merged coverage (CI only)
- `deploy:skills` — symlink authored Agent Skills to agent directories

Test tasks hash `CI` into their cache key (`env: ["CI"]` in `turbo.json`) so local and CI caches don't collide — Vitest uses different reporters and coverage settings under CI.

### Root tasks

Work owned by the workspace root rather than any package is emitted as a turbo root task (`//#<name>`), backed by a root `package.json` script of the same name and wired into the aggregate its per-package counterpart feeds:

- `//#lint:eslint` — root has its own `eslint.config.*`. Lints root files per-package lint never sees; `lint` depends on it.
- `//#deploy:skills` — root has its own `skills/`. Skills consumed as `<root>/skills/<name>/SKILL.md` — the `skills` CLI reading a repo tarball, a dotfiles script symlinking a clone — can't move into a package, so a workspace can package everything else and still author skills at the root; `build` depends on it.
- `//#typecheck:ts` — root has TypeScript of its own, typically the `eslint.config.ts` / `vitest.config.ts` that per-package `typecheck:ts` never sees; `typecheck` depends on it.

All are monorepo-only: where the root _is_ the lone package, its per-package task already covers those files.

**`//#typecheck:ts` keys on sources, not on a tsconfig.** Sync writes a root `tsconfig.json` at every workspace root, so its presence says nothing about whether there is anything to check — and a config whose `include` matches no file is an error to tsc (`TS18003`), not a no-op. The task is therefore emitted only when the root actually holds a TypeScript file that `include` reaches: a root-level `*.ts`, or one nested under `bin/`, `scripts/`, `src/`, `test/`, or `e2e/`.

**Root tasks declare no `dependsOn`.** `generate` and `transit` are package tasks, and turbo resolves a bare dependency name against the task's own package, so naming either from the root dangles rather than reaching the packages. Nothing is lost on the artifact side: workspace packages export TypeScript source in-workspace, so the root type-checks and lints against sources without waiting on a compile.

A root task's script _is_ its command, so a root owning one gets no `gtb turbo run <name>` alias for it — the alias would re-enter turbo and trip the recursion guard above. At such a root `pnpm deploy:skills` deploys the root's own skills; `pnpm build` (or `gtb turbo run deploy:skills`) reaches every package's copy.

### Codegen tasks (`generate:*`)

Any `generate:*` script in a package's `package.json` is picked up as codegen and ordered ahead of `typecheck:ts`, `compile:ts`, and `lint:eslint`, all of which read generated sources.

Where the _leaf_ tasks get declared depends on the repo shape, because only the package knows what its codegen reads and writes. That matters more than it looks: turbo restores a cached task's declared `outputs` on a hit, so a leaf with none replays its logs, skips the run, restores nothing — and the generated files stay missing while every downstream task reports success. A script name tells `gtb sync` nothing about outputs, so it doesn't guess.

**Monorepo** — the root `generate` aggregate is emitted empty, and each package declares its own leaves in a package configuration (`packages/<pkg>/turbo.json`):

```json
{
  "extends": ["//"],
  "tasks": {
    "generate": { "dependsOn": ["generate:prisma"] },
    "generate:prisma": {
      "inputs": ["prisma/schema.prisma"],
      "outputs": ["src/generated/**"]
    }
  }
}
```

The aggregate stays empty rather than naming leaves the root can't define, because turbo aborts the entire run when a task in `dependsOn` resolves to no definition anywhere in the config chain (`Could not find "<pkg>#generate:prisma" in root turbo.json`). The flip side is that a package which never writes this file fails quietly — its `generate` node has nothing under it, so codegen is skipped and downstream tasks read whatever is already on disk. `gtb verify` closes that gap: it reports packages with `generate:*` scripts and no package configuration, leaves missing from `generate`'s `dependsOn`, and leaves declaring neither `outputs` nor `cache: false`.

**Single-package repo** — turbo offers package configurations only for workspace packages, and the lone `turbo.json` is sync-owned, so there is no seam to hand off to. Sync declares the leaves itself with `cache: false`. Codegen then re-runs on every invocation, which is slower than a cache hit and the only safe default when the outputs are unknowable.

### Non-obvious dependencies

- **`lint:eslint` depends on `typecheck:ts`** — prevents confusing linter output from type errors. ESLint (via `typescript-eslint`) runs its own type resolution, so the dep isn't strictly required; consumers who prefer parallelism over cleaner output can remove it. Cross-package invalidation doesn't ride on this edge — `lint:eslint` declares its own `transit` dep — so dropping it costs only the output ordering.
- **`typecheck:ts`, `lint:eslint`, and every vitest task depend on `transit`** — see [The `transit` node](#the-transit-node). This includes `test:vitest:e2e`: it reads packed tarballs, but its own sources import fixture helpers from source-only workspace packages.
- **Test tasks gate on `^compile`, not `^compile:ts`** — the aggregate covers every compile flavour a dependency publishes from (`compile:skills` today), where the leaf names one toolchain. It still resolves to a no-op for a dependency that compiles nothing.
- **Test tasks don't depend on `typecheck:ts`** — parallelism wins.
- **`deploy:skills` depends on `lint:eslint` same-package (no `^`)** — catches broken frontmatter and markdown in `SKILL.md` before deploy. Skills are authored independently per package; there's no topological chain.
- **`build:ci` excludes `test:slow`, `test:e2e`, `deploy:skills`** — CI runs fast tests; slow/e2e run on full builds; CI has no agents to serve skills to.

`deploy:skills` keys on `skills/**` and `skills-npm.config.ts` only. If you install or remove an agent and want existing skills resymlinked into the new agent's project-local dir, run `gtb turbo run deploy:skills --force` once — turbo's cache otherwise reports HIT and skips the redeploy.

### Who owns what in `dist/source`

Several tasks write the published output directory, each declaring `outputs` for only its own share, and `compile:ts` clears the directory before emitting. See [the `dist/source` ownership reference](references/dist-source-ownership.md) before changing an output glob or overriding `compile:ts`.

### The `transit` node

`transit` is a scriptless turbo node, depending only on `^transit`, that pulls every transitive workspace dependency's file hashes into a consumer's task hash. Tasks reading a dependency as source rather than as a build artifact need it — without it they replay a cached pass after that dependency changed, a stale green. See [the `transit` node reference](references/transit-node.md).

## `gtb sync` and `gtb verify`

`gtb sync` reconciles generated state:

- `turbo.json` tasks + aggregates (scope: `turbo`)
- per-package `tsconfig.json` / `tsconfig.build.json`, plus a scaffolded root `tsconfig.base.json` (scope: `tsconfig`)
- per-package + root `package.json` scripts (scope: `scripts`)
- `mise.tasks.toml` — the `hk:all` / `hk:base` mise tasks, written only when the root has a `mise.toml` (scope: `mise`)
- `codecov.yml` flags + components (scope: `codecov`)

Run after adding packages, changing the task graph, or updating tooling. Without `--force`, existing script values are preserved — this is how packages keep custom overrides. Use `--force` only when intentionally resetting scripts to their generated defaults.

**Codecov flag/component names.** Derived from each package's unscoped `package.json` name (`@acme/utils` → `utils`), falling back to the directory basename only when a package declares no name — the basename belongs to the checkout, so a worktree or a differently-named clone would regenerate a different `codecov.yml` and drift-fail `gtb verify` in CI. The same derivation backs the `-F` flag `coverage:codecov:upload` sends, so uploads always land under a declared flag. Two packages whose names collide after scope-stripping are a sync error (Codecov keys flags by name); two sharing a directory basename are fine.

**The base tsconfig.** Every generated config extends `./tsconfig.base.json`, the one tsconfig the consumer hand-authors to pick a shared `@gtbuchanan/tsconfig` variant. Sync scaffolds it (extending `@gtbuchanan/tsconfig/node.json`) only when absent and never overwrites it, so an edited variant survives re-sync. `gtb verify` checks its presence — not its contents — since a missing base silently breaks every generated config's `extends`.

**Single-package tsconfigs.** When the root _is_ the lone package (no `packages` globs in `pnpm-workspace.yaml`), the root and per-package tsconfig layers target the same files, so sync collapses them into one: both `tsconfig.json` and `tsconfig.build.json` extend `./tsconfig.base.json`, and the build config carries the root layer's `declaration`/`sourceMap` alongside the package layer's `outDir`/`rootDir`/`include`. Package `extends` paths are derived from the package's actual depth below the root, not assumed to be `packages/<name>`.

**Scoped runs.** Both `gtb sync` and `gtb verify` take positional scope args to limit the work to a subset: `gtb sync mise`, `gtb verify mise turbo`. No args means all scopes. This lets a repo regenerate or check just one artifact — e.g. an hk-preset adopter runs `gtb sync mise` to write `mise.tasks.toml` without a full workspace sync. An unknown scope exits non-zero.

`mise.tasks.toml` is loaded by a one-time manual `[task_config] includes = ["mise.tasks.toml"]` in `mise.toml` (so sync never round-trips the hand-authored file); `gtb verify mise` asserts the include is present. An explicit `includes` replaces mise's default `mise-tasks/` discovery, so a repo keeping its own script tasks lists both: `includes = ["mise-tasks", "mise.tasks.toml"]`.

`gtb verify` validates no drift from the expected baseline. Exits non-zero if anything is out of sync. Run in CI as a drift gate. Use `--ignore <name>` to skip a specific task or script — prefer fixing the drift. The `mise`/`codecov` checks self-skip when the repo doesn't use those tools (no `mise.toml` / no vitest tests).

Most checks compare a file against what sync would generate. The `turbo` scope carries one that doesn't: the `generate:*` package configurations described above are author-owned, so verify asserts they exist and are wired correctly instead of regenerating them (`--ignore generate:<name>` opts a script out).

**Published packages can't depend on private ones.** The `manifest` scope carries the other non-generated check: every install-time workspace dependency of a published package must itself be published. pnpm rewrites a `workspace:` specifier to the linked package's concrete version at pack time and never asks whether that version reached the registry — a `private: true` package still has a `version` to substitute — so the tarball ships a dependency no consumer can resolve, and `pnpm publish` says nothing. The check covers `dependencies`, `peerDependencies`, and `optionalDependencies`, since all three survive publish and take the same rewrite. Two things are exempt: `devDependencies`, which publishing strips, and anything `bundleDependencies` actually bundles, which the tarball carries itself. The remedy is publishing the dependency, or moving it to `devDependencies` when it's build-time only — a workspace package a bundler inlines is exactly that, and belongs there regardless.

**`bundleDependencies: true` is not a blanket exemption.** Its two forms bundle different things, measured against `pnpm pack`: an explicit name list bundles that package out of whichever field declares it, while `true` covers `dependencies` alone. A workspace peer or optional dependency under `true` keeps its rewritten specifier but never reaches the tarball, so it stays checked. (pnpm honors `bundleDependencies` only under `nodeLinker: hoisted` — it hard-errors with `ERR_PNPM_BUNDLED_DEPENDENCIES_WITHOUT_HOISTED` on the default isolated linker, so none of this applies to a workspace on pnpm's defaults.)

An e2e suite won't catch this on your behalf. A harness that installs each workspace dependency's local tarball alongside the package under test resolves a private dependency perfectly well; only a real consumer 404s. That gap is what makes the static check worth having.

## Pre-commit hooks (`gtb hk`)

`gtb hk` runs the [hk](https://hk.jdx.dev) pre-commit hooks, and is what the generated `hk:all` / `hk:base` mise tasks call. It locally applies fixes and in CI runs a non-modifying check (keyed on the `CI` env var), mirroring prek's `run`.

- `gtb hk base [ref] [-- <hk args>]` — runs hk on files changed from a base ref (default `origin/main`; pass a ref to override). On shallow clones it fetches the base first, then hands the range to hk as `--from-ref=<base> --to-ref=HEAD`. Forward args to hk after the ref, e.g. `gtb hk base -- -S eslint` targets a single hook.
- `gtb hk all [-- <hk args>]` — runs hk across every file.

Invoked via mise (`mise run hk:base`) so hk and its tools resolve from mise. The mise task resolves `gtb` itself per repo shape — see the `mise.tasks.toml` notes above.

## Android-Termux setup

Termux's Node reports `process.platform === 'android'`, which the `node_modules` turbo launcher rejects outright; install turbo from Termux's own registry (`pkg install turbo`) and `gtb turbo` execs it directly. Separately, run heavy aggregates (`build`, `test:slow`, `test:e2e`) with `--concurrency=1` on any memory-constrained host. See [the Android-Termux reference](references/android-termux.md) for the full setup, the `@gtbuchanan/pnpm-termux-shim` rationale, and why `gtb turbo` doesn't set the concurrency ceiling itself.

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
