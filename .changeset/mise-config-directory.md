---
'@gtbuchanan/cli': minor
---

Find a mise config wherever mise reads one, `.config/` included

`gtb sync` now recognizes `mise.toml`, `.mise.toml`, `.config/mise.toml` and
`.config/mise/config.toml`, and turbo's global dependencies hash every mise
config and lockfile present.
