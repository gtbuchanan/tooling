---
'@gtbuchanan/hk-config': patch
---

Run `gtb-verify` on a change to any mise config gtb reads

The step fired only on a root `mise.toml`, so editing `.mise.toml`,
`.config/mise.toml` or `.config/mise/config.toml` skipped the drift check.
