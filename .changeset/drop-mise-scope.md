---
'@gtbuchanan/cli': major
---

Drop the `mise` scope from `gtb sync` and `gtb verify`

The hk toolchain now plans `mise.tasks.toml` under the `toolchains` scope, and
`gtb verify` fails when the generated file is missing or edited, not only when
`mise.toml` lacks its include. Replace `gtb sync mise` and `gtb verify mise`
with a bare `gtb sync` and `gtb verify`, or with `Defaults.gtbCliSteps` from
`@gtbuchanan/hk-config` in `hk.pkl`.
