---
'@gtbuchanan/cli': minor
---

Check the monorepo root's turbo alias scripts in `gtb verify`

`gtb verify` now reports a missing `check`, `build` or other turbo alias in a
monorepo root's `package.json`, which `gtb sync` already adds back on every run.
`--ignore <name>` exempts one. `gtb sync` also fails on a single-package root
script that shadows a turbo aggregate, as `gtb verify` already did, and the
`scripts` scope is gone: its scripts sync and verify under `toolchains`.
