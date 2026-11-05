---
'@gtbuchanan/cli': minor
---

`gtb verify toolchains` now fails a repo whose `.changeset/config.json` doesn't set `"format": false`. `gtb version` formats the CHANGELOGs with hk, and changesets' `"auto"` default would otherwise run a root-installed prettier over them first, without eslint-config's options. Add `"format": false` to the config to pass.
