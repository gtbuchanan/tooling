# Contributing to @gtbuchanan/tooling

## Prerequisites

[mise] manages the repo's pinned dev tools for every contributor and
CI. Run `mise install` to get the versions the repo pins.
Those versions live in `mise.toml`; pnpm's version lives in
`package.json`'s `packageManager` field because turbo requires that
field for workspace resolution (mise reads the version from there via
`idiomatic_version_file_enable_tools`).

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

`mise install` installs [hk] hooks that verify changed files each time
you commit. If the hooks find issues they autofix what they can and fail
the commit — review the corrections, stage them, and try again.
Commit often so issues stay small.

To run hk without committing:

| Action            | Command            |
| :---------------- | :----------------- |
| Fix changed files | `mise run hk:base` |
| Fix all files     | `mise run hk:all`  |

Both fix locally and check in CI. `hk:base` diffs against `origin/main`
(pass a ref to override); `hk:all` covers every file. Forward args to
hk — e.g. `mise run hk:base -- -S eslint` targets a single hook.

## Versioning

Uses [changesets] for per-package versioning. Every PR requires a
changeset — CI enforces this.

- `pnpm exec changeset` — declare which packages changed and the bump type
- `pnpm exec changeset --empty` — for PRs that don't need a version bump
  (CI changes, docs, etc.)

## Termux/Android setup

mise itself is Termux-packaged here (`pkg install mise`), but **mise's
install backends have no Android targets for this repo's tools** —
`node`, `pnpm`, `hk`, `pkl`, and `actionlint` all key off
`android/arm64`, for which aqua/core ship no assets. Each is installed
out of band and disabled in mise so it doesn't try to manage them:

```toml
# ~/.config/mise/config.toml
[settings]
disable_tools = ["node", "pnpm", "hk", "pkl", "actionlint"]
```

- **node** — `pkg install nodejs-lts`; mise's `core:node` only builds
  from source on Bionic, which doesn't compile. mise picks up system
  node from `PATH`.
- **pnpm** — `npm i -g pnpm` (no `android/arm64` aqua asset).
- **turbo** — `pkg install turbo`.
- **hk** — download the static musl aarch64 release tarball
  (`hk-aarch64-unknown-linux-musl.tar.gz`); it runs unmodified on
  Bionic.
- **actionlint** — download the prebuilt `linux_arm64` release; it's a
  static Go binary that runs unmodified. hk orchestrates it as a
  workflow-lint step but doesn't depend on it at runtime.
- **pkl** — Apple ships only `pkl-linux-aarch64`, a glibc-dynamic binary
  that ENOENTs on Bionic's missing loader. Install glibc-runner
  (`pkg install glibc-runner`), run `grun -c pkl-linux-aarch64` once to
  patch the ELF interpreter, then put a `grun pkl-linux-aarch64 "$@"`
  wrapper on `PATH` as `pkl`. hk only invokes `pkl` for
  `validate`/`check`/`fix`/`install`.

The maintainer's [dotfiles] automate this end to end and pin the
versions to match `mise.toml`; consult its Android chezmoi scripts for
the exact install steps.

[changesets]: https://github.com/changesets/changesets
[dotfiles]: https://github.com/gtbuchanan/dotfiles
[hk]: https://hk.jdx.dev
[mise]: https://mise.jdx.dev
