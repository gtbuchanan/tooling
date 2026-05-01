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
paths. That fix is Bionic-only: it never loads into glibc-built binaries
like the upstream Linux turbo distribution. So when turbo (or any other
glibc binary) spawns `pnpm`, the rewriting doesn't happen and the kernel
sees the literal shebang path. ENOENT.

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

See [vercel/turborepo#5616](https://github.com/vercel/turborepo/issues/5616)
for the upstream context: native Android support for turbo was declined,
so consumers run the linux-arm64 binary on Termux and work around the
spawn behavior with shims like this one.

## Usage

Add to `optionalDependencies` of any package whose graph spawns `pnpm`
via a glibc binary on Termux:

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

The wrapper honors `$PREFIX` (Termux's standard prefix env var), so
non-default Termux install layouts still work; if `$PREFIX` is unset
the wrapper falls back to the standard `/data/data/com.termux/files/usr`.
