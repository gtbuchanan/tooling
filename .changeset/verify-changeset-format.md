---
'@gtbuchanan/cli': minor
---

Require `"format": false` in `.changeset/config.json`

`gtb sync` now sets it, and `gtb verify` fails until it's set. `gtb version`
formats the CHANGELOGs with hk, and changesets' `"auto"` default would otherwise
run a root-installed prettier over them first, without eslint-config's options.
Every other key in the config is kept. Repos that don't depend on
`@gtbuchanan/cli`, or have no changesets config, are unaffected.
