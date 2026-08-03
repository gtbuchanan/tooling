# @gtbuchanan/pnpm-termux-shim

`pnpm` wrapper script with an absolute-path shebang, scoped to
`os: ["android"]` so it only installs on Termux.

## Why

Termux's filesystem has no `/usr/bin/env`. When a native binary spawns a
shebang script via `execve`, the kernel dereferences the shebang path
literally — so `#!/usr/bin/env node` (pnpm's default shebang) fails with
ENOENT.

Termux ships an `LD_PRELOAD` (`libtermux-exec-ld-preload.so`) that
rewrites these shebangs in libc's `execve` to point at Termux's actual
paths. `LD_PRELOAD` is a dynamic-loader feature, so it never reaches a
binary the loader isn't involved in — including the upstream Linux
turbo, which ships statically linked (no `PT_INTERP`). So when turbo (or
any other such binary) spawns `pnpm`, the rewriting doesn't happen and
the kernel sees the literal shebang path. ENOENT.

The fix is a `pnpm` shim whose own shebang is an absolute path
(`#!/data/data/com.termux/files/usr/bin/bash`). The kernel resolves it
fine, the shim execs `node` with pnpm's `.cjs` entry point directly, and
no `/usr/bin/env` lookup happens anywhere.

This package ships that shim as a `bin` entry. Adding it as
`optionalDependencies` of any package puts a working `pnpm` in
`<rootDir>/node_modules/.bin/`, which `pnpm exec` orders ahead of the
broken system `pnpm` in `PATH`. The shim's `os: ["android"]` filter
means non-Android consumers skip the install entirely — zero footprint
on macOS, Linux, or Windows.

The `os` filter lives under `publishConfig` in the source manifest so
the dev workspace doesn't trip pnpm's "unsupported platform" warning
during dogfooding. The published tarball still ships with
`"os": ["android"]` at the top level.

Upstream context:
[vercel/turborepo#5616](https://github.com/vercel/turborepo/issues/5616)
asked for Android support and was declined in 2023;
[vercel/turborepo#12735](https://github.com/vercel/turborepo/pull/12735)
reversed that in turbo 2.10.8 by publishing the `linux-arm64` binary
under `os: ["android", "linux"]`. That makes the npm launcher start on
Termux — it does not change how the binary spawns children, which is
what this shim addresses.

## Usage

Add to `optionalDependencies` of any package whose graph spawns `pnpm`
from a binary the Termux `LD_PRELOAD` can't reach:

```jsonc
{
  "optionalDependencies": {
    "@gtbuchanan/pnpm-termux-shim": "^0.1.0",
  },
}
```

That's it. On Android the shim symlinks to `node_modules/.bin/pnpm` and
shadows the broken system `pnpm` for any subprocess that resolves via
the project's bin directory. Everywhere else, the dependency is filtered
out and nothing is installed.

One caveat for the process doing the resolving: it must reach the shim
through an **absolute** PATH entry. pnpm prepends a relative
`./node_modules/.bin`, and a consumer that resolves a binary from one
directory but spawns it from another then gets ENOENT — turbo does
exactly this, resolving the package manager at the repo root and
spawning each task in its package directory. `gtb turbo` from
[`@gtbuchanan/cli`](https://github.com/gtbuchanan/tooling/tree/main/packages/cli)
absolutizes PATH before invoking turbo for this reason.

The wrapper honors `$PREFIX` (Termux's standard prefix env var), so
non-default Termux install layouts still work; if `$PREFIX` is unset
the wrapper falls back to the standard `/data/data/com.termux/files/usr`.
