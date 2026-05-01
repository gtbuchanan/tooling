# Contributing to @gtbuchanan/tooling

## Prerequisites

- **Node.js** — Version satisfying `engines.node` in `package.json`
  (currently `>=24.0.0`). `engineStrict: true` in `pnpm-workspace.yaml`
  makes `pnpm install` fail loudly if your active Node is below the
  floor.
- **pnpm** — The version pinned in `packageManager`
  (currently `pnpm@10.32.1`). Enable [Corepack] to have it managed
  automatically (`corepack enable`), or install the pinned version
  manually.

Once prerequisites are in place, install dependencies and verify your
setup with a full build:

```sh
pnpm install
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

`pnpm install` installs [prek] hooks (via the `prepare` script) that
verify changed files each time you commit. If the hooks find issues
they autofix what they can and fail the commit — review the
corrections, stage them, and try again. Commit often so issues stay
small.

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

Before `pnpm install`, widen pnpm's `supportedArchitectures` whitelist
in your per-user global rc so the Linux turbo binary is downloaded:

```text
# ~/.config/pnpm/rc
supported-architectures.os[]=current
supported-architectures.os[]=linux
```

Then `pnpm install --force` once. Everything else (the linux turbo
binary discovery via `gtb turbo`, the `pnpm` bin shim via
`@gtbuchanan/pnpm-termux-shim`) is handled automatically.

**prek/uv libc detection.** prek's bundled `uv` aborts during
managed-Python discovery because Bionic isn't recognized as glibc or
musl. Set `UV_LIBC=none` in your shell rc so `uv` falls back to
Termux's system Python:

```sh
export UV_LIBC=none
```

[changesets]: https://github.com/changesets/changesets
[Corepack]: https://nodejs.org/api/corepack.html
[prek]: https://github.com/j178/prek
