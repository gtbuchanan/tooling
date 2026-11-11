---
'@gtbuchanan/cli': major
---

Find a mise config wherever mise reads one, `.config/` included

`gtb sync` now recognizes `mise.toml`, `.mise.toml`, `.config/mise.toml` and
`.config/mise/config.toml`, and turbo's global dependencies hash every mise
config and lockfile present.

The `hk:all` / `hk:base` tasks move from `mise.tasks.toml` to
`.config/mise/conf.d/gtb.toml`, which mise loads with no `include`, so
`gtb verify` no longer asks for a `[task_config] includes` entry. After
upgrading, run `gtb sync`, then delete `mise.tasks.toml` and its `includes`
entry: while both remain, the old tasks override the new ones, so `gtb verify`
fails until the file is gone.
