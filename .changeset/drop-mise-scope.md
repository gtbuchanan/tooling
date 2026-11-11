---
'@gtbuchanan/cli': major
---

Drop the scopes from `gtb sync` and `gtb verify`

Both commands now always run in full and reject any positional argument, so
`gtb sync mise` or `gtb verify toolchains` exits 1 instead of running. Replace
a scoped call with a bare `gtb sync` or `gtb verify`, or an hk step with
`Defaults.gtbCliSteps` from `@gtbuchanan/hk-config`.

`gtb verify` also fails when `mise.tasks.toml` is missing or edited, not only
when `mise.toml` lacks its include.
