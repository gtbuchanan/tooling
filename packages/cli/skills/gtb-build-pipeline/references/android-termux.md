# Android-Termux setup

Two issues are caused by Termux's Node reporting `process.platform === 'android'`; a third (memory pressure) is unrelated and applies to any low-memory host. Native Android support upstream was declined in [vercel/turborepo#5616](https://github.com/vercel/turborepo/issues/5616), so `gtb turbo` ships the workaround instead.

**1. Node_modules launcher rejects android.** The launcher in `node_modules/.bin/turbo` exits early when `process.platform === 'android'`, and pnpm filters `@turbo/<os>-<arch>` optional dependencies by host platform so none of the bundled platform binaries are installed either. Install the native turbo from Termux's package registry instead:

```sh
pkg install turbo
```

That puts a Bionic-built `turbo` at `$PREFIX/bin/turbo` (typically `/data/data/com.termux/files/usr/bin/turbo`). `gtb turbo` resolves it directly via `$PREFIX` (with the standard prefix as fallback) and execs it, bypassing the node_modules launcher entirely.

**2. Turbo child-process spawn ENOENT (historically).** The npm-distributed Linux turbo binary is glibc-built, but Termux is Bionic. Termux's `LD_PRELOAD=libtermux-exec-ld-preload.so` rewrites `/usr/bin/env` shebangs in `execve` syscalls — but the preload is Bionic-only, so it never loads into a glibc turbo. When such a turbo spawns `pnpm`, the kernel sees `#!/usr/bin/env node` and fails because Termux has no `/usr/bin/env`.

The Termux-pkg turbo is Bionic-built, so the preload loads correctly and child-process spawns resolve `pnpm` without issue. `@gtbuchanan/pnpm-termux-shim` is retained defensively in case turbo reintroduces a glibc npm distribution, or another glibc binary in the graph needs to spawn `pnpm`. The shim is an `os: ["android"]`-filtered package whose `bin: { pnpm: ... }` entry has an absolute-path shebang; pnpm symlinks it into `<rootDir>/node_modules/.bin/pnpm` ahead of the system `pnpm` in PATH. On non-Android hosts it's filtered out at install — zero footprint.

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
