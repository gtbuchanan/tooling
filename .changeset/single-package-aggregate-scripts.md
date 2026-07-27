---
'@gtbuchanan/cli': patch
---

Stop generating recursive aggregate scripts in single-package repos

`gtb sync` no longer writes the `check` / `build` / `build:ci` / `pack` /
`test:slow` / `test:e2e` / `coverage:merge` root aliases when the root is
the lone package. There, turbo resolves the aggregate to the root script,
which re-invokes turbo, and the run aborts on turbo's
`recursive_turbo_invocations` guard. Dispatch aggregates directly instead
(`gtb turbo run check`); the leaf scripts, which call `gtb task`, are
unchanged.

`gtb verify` now reports a root script that shadows an aggregate so repos
synced before this change learn which scripts to delete.
