# @gtbuchanan/cli

## 0.2.1

### Patch Changes

- 9ff09c7: Fix `gtb` crashing on startup when TypeScript 7 is the resolved compiler

  `tsconfig-gen` resolved a package's build `include` through the classic
  `typescript` compiler API (`ts.sys`, `ts.readConfigFile`,
  `ts.parseJsonConfigFileContent`). TypeScript 7 restructured its npm package so
  those are no longer exposed from the main entry, leaving `ts.sys` undefined and
  crashing every `gtb` command at module load. The build `include` is now read
  with `get-tsconfig`, which mirrors tsc's `extends` resolution — relative paths
  and node_modules package specifiers alike — without depending on the
  `typescript` package. `typescript` remains a peer dependency for the
  `tsc`-backed `compile:ts` / `typecheck:ts` tasks.

## 0.2.0

### Minor Changes

- 53d0534: Add `gtb version` and fold npm publishing into `gtb publish`

  `gtb version` runs `changeset version` then a `manifest`-scoped sync in one
  process, so any regenerated native manifest (e.g. a Pkl `PklProject`) lands in
  the same changesets version commit/PR. CD passes it as changesets/action's
  `version` command — the chaining lives in `gtb` because the action splits its
  `version` input on whitespace and execs it without a shell, so a `&&` chain is
  passed to changesets as bogus args.

  `gtb publish` now runs `changeset publish` (npm) before dispatching the non-npm
  channels, making it the single publish command for a release. Both halves stay
  idempotent and no-op when the workspace ships no such package.

### Patch Changes

- 02e25ff: Drop hk batching/diff workarounds fixed upstream in hk 1.47

  hk 1.47 made auto-batching respect the platform command-line limit
  (cmd.exe on Windows) and added a no-merge-base fallback for ref diffs,
  so the local workarounds are no longer needed:

  - `@gtbuchanan/hk-config`: drop the `batchFiles` primitive and the
    per-step `batch` wiring from `fileHygiene` — hk auto-batches under the
    arg limit on its own.
  - `@gtbuchanan/cli`: `gtb hk all` no longer sets `HK_BATCH`, and
    `gtb hk base` hands the range to hk as `--from-ref=<base> --to-ref=HEAD`
    instead of pre-computing the changed-file list.

- d8f16ea: Ship README and LICENSE in published npm tarballs

  `pack:npm` now copies each package's `README.md` and the workspace-root
  `LICENSE` into `dist/source/` (the directory `publishConfig.directory`
  redirects publishing to), and the published `package.json` carries a
  `license` field. A package-level `README`/`LICENSE`/`license` overrides the
  shared root one. Re-publishes every package so the first release's missing
  docs are corrected.
