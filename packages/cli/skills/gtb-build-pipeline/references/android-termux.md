# Android-Termux setup

Two issues are specific to Termux, getting a turbo that runs and getting it to spawn `pnpm`, and a third (memory pressure) applies to any low-memory host. The [`@gtbuchanan/pnpm-termux-shim` README](https://github.com/gtbuchanan/tooling/tree/main/packages/pnpm-termux-shim#readme) explains the first two; what follows is what to do.

**1. Getting a turbo that runs.** Depend on turbo `^2.10.8`, whose npm launcher starts on Android. A repo still using the Termux-packaged turbo (`pkg install turbo`) should bump turbo rather than keep it: that package lags upstream and rejects keys `gtb sync` writes into `turbo.json`.

**2. Turbo child-process spawn failures.** turbo can't spawn Termux's own `pnpm`, failing every task with `unable to spawn child process: Exec format error (os error 8)`. Run turbo through `gtb turbo`, as every generated root script does: `@gtbuchanan/cli` carries `@gtbuchanan/pnpm-termux-shim` and `gtb turbo` puts it first on PATH, so the repository declares nothing. A repo that must run plain `turbo` declares the shim itself, as the shim README describes.

**3. Memory-bound concurrency for heavy aggregates.** Unrelated to `process.platform`: phones typically have 2–4GB free RAM under load. Turbo's default `--concurrency=10` is fine for `check` (typecheck + lint + fast tests fan out narrowly under the dependency graph). It is **not** fine for `build`, `test:slow`, or `test:e2e`, which fork their own vitest worker pools per task — `--concurrency=2` already crashed the OS in measurement. Run heavy aggregates with `--concurrency=1` on memory-constrained devices:

```sh
pnpm build --concurrency=1
pnpm test:slow --concurrency=1
pnpm test:e2e --concurrency=1
```

`gtb turbo` does not auto-set this — the right ceiling depends on which aggregate you're running and on free memory at invocation time, neither of which the wrapper can predict. Same applies to any low-memory host (small CI runners, etc.), not just Termux.

If your host _always_ needs this (e.g., a Termux dev machine, a tight CI runner), encode it as a project rule in always-loaded agent context (`AGENTS.md`, `CLAUDE.md`, repo memory, etc.) rather than relying on discretionary skill activation. Skills load body-on-trigger, but operational rules that must fire every session belong in the system prompt.
