---
'@gtbuchanan/hk-config': minor
---

Bump the hk package imports to v2.13.0

`HkPackage.pkl` imports hk's `Config.pkl` and `Builtins.pkl` from a
version-pinned release URL, now v2.13.0.

Move your own `hk.pkl` `amends` URL to v2.13.0 in the same change. Pkl treats
the same class from two hk versions as unrelated types, so a config amending
one version while importing a preset built on another fails to evaluate.
