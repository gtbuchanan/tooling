# Contributing to @gtbuchanan/tooling

## Prerequisites

[mise] manages Node, pnpm, and prek for every contributor and CI.
Run `mise install` to get the versions the repo pins. Node and prek
versions live in `mise.toml`; pnpm's version lives in
`package.json`'s `packageManager` field because turbo requires that
field for workspace resolution (mise reads the version from there via
`idiomatic_version_file_enable_tools`). `mise.lock` carries
per-platform binary checksums for all three.

Install mise:

- **Windows** — `winget install jdx.mise`
- **macOS** — `brew install mise`
- **Linux** — `curl https://mise.run | sh`
- **Termux/Android** — see [Termux/Android setup](#termuxandroid-setup)

Then trust the workspace config and bootstrap:

```sh
mise trust
mise install
mise run bootstrap
```

`mise install` reads `mise.toml` + `mise.lock` and verifies each
downloaded binary against the recorded sha256. `mise run bootstrap`
then runs `pnpm install --frozen-lockfile` (and on Termux/Android,
symlinks the pnpm shim into `node_modules/.bin`).
`[settings] lockfile = true` in `mise.toml` keeps the lockfile
self-perpetuating: a local `mise.toml` edit re-runs through `mise
install` and rewrites `mise.lock`. CI runs with `MISE_LOCKED=1` and
fails loudly on any drift between the two files (analogous to pnpm's
`--frozen-lockfile`).

Verify your setup with a full build:

```sh
pnpm build
```

## Scripts

Top-level scripts delegate to Turborepo:

- `pnpm check` — Typecheck, lint, and test:fast (use during development)
- `pnpm build` — Full pipeline: check + test:slow + pack + test:e2e
- `pnpm build:ci` — CI pipeline: check + pack (slow/e2e run as separate jobs)

Turbo tasks can also be run individually:

- `pnpm exec gtb turbo run typecheck:ts` — TypeScript type-checking
- `pnpm exec gtb turbo run lint` — ESLint
- `pnpm exec gtb turbo run test:vitest:fast` — Fast source tests only
- `pnpm exec gtb turbo run test:vitest:slow` — Slow source tests only (tagged `slow`)

All commands go through Turbo for caching:

- `pnpm pack` — Pack tarballs (per-package `pack:npm` via Turbo)
- `pnpm test:e2e` — E2E tests (Turbo cache restores tarballs)

## Pre-commit

`mise run bootstrap` installs [prek] hooks (via the `prepare` script
that pnpm runs during install) that verify changed files each time
you commit. If the hooks find issues they autofix what they can and
fail the commit — review the corrections, stage them, and try again.
Commit often so issues stay small.

To run prek without committing:

| Action          | Command                                         |
| :-------------- | :---------------------------------------------- |
| Simulate commit | `prek run`                                      |
| Simulate PR run | `prek run --from-ref=origin/main --to-ref=HEAD` |

## Versioning

Uses [changesets] for per-package versioning. Every PR requires a
changeset — CI enforces this.

- `pnpm exec changeset` — declare which packages changed and the bump type
- `pnpm exec changeset --empty` — for PRs that don't need a version bump
  (CI changes, docs, etc.)

## Termux/Android setup

**mise via `termux-chroot`.** mise's downloaded binaries are standard
Linux builds that hardcode `/lib`, `/usr`, etc. Termux's prefix is
`/data/data/com.termux/files/usr`, so those paths don't resolve
without a chroot wrapper. Add this to your shell rc so `mise` always
runs through `termux-chroot`:

```sh
mise() { SSL_CERT_FILE="$PREFIX/etc/tls/cert.pem" termux-chroot command mise "$@"; }
```

(`pkg install termux-chroot` if it isn't already installed.)

**Mixed setup: Termux packages for Node + pnpm, mise for prek.** mise
shims exec downloaded glibc/musl ELFs directly, bypassing
`termux-chroot` and ENOENTing on Bionic's missing dynamic linker.
Install Node, pnpm, and turbo via `pkg install nodejs pnpm turbo`
(Bionic-native) and let mise handle prek (static musl aarch64). Tell mise to ignore
the broken tools:

```toml
# ~/.config/mise/config.toml
[settings]
disable_tools = ["node", "pnpm"]
```

`disable_tools` doesn't garbage-collect previously-created shims —
`rm ~/.local/share/mise/shims/{node,pnpm}` if you've installed them
in the past.

**prek/uv libc detection.** prek's bundled `uv` aborts during
managed-Python discovery because Bionic isn't recognized as glibc or
musl. Set `UV_LIBC=none` in your shell rc so `uv` falls back to
Termux's system Python:

```sh
export UV_LIBC=none
```

[changesets]: https://github.com/changesets/changesets
[mise]: https://mise.jdx.dev
[prek]: https://github.com/j178/prek
