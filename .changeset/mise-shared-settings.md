---
'@gtbuchanan/cli': minor
---

Generate the mise settings every gtb repository shares

`.config/mise/conf.d/gtb.toml` now sets `min_version = "2026.9.16"`,
`lockfile = true`, a 3-day `minimum_release_age` that exempts gtb's own
releases, and `DO_NOT_TRACK`. A repository with an `hk.pkl` or
`.config/hk.pkl` also gets `HK_MISE` and a `postinstall` hook running
`hk install --mise`. A key the repository sets in its own mise config still
wins, so after `gtb sync` you can delete the copies of these settings it
carries. Delete its own `hk install` hook too: mise runs the hooks of every
file, so it would install twice.

The `hk:all` / `hk:base` tasks are now written only where the repository
configures hk.
