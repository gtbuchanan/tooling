---
'@gtbuchanan/hk-config': minor
---

Bump the hk package imports to v2.8.1

`Defaults.pkl` imports `Config.pkl` and `Builtins.pkl` from a
version-pinned hk release URL, so consumers of the preset resolve
whichever hk the pin names. Move that pin to v2.8.1, matching the
version `mise.toml` installs.

A consumer moves its own `hk.pkl` `amends` URL to v2.8.1 in the same
change that takes this release. Pkl treats the same class from two hk
versions as unrelated types, so a config that amends one version while
importing a preset built on another fails to evaluate.
