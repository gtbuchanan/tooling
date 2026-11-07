---
'@gtbuchanan/cli': minor
---

Remove the `manifest` sync scope

The Pkl toolchain now stamps each publishable `PklProject` under the `toolchains` scope, and `gtb version` runs a full sync after `changeset version`. `gtb sync manifest` and `gtb verify manifest` now fail with an unknown scope.
