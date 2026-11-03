---
'@gtbuchanan/cli': patch
---

Run `hk fix --unstaged` at the end of `gtb version`, so the CHANGELOGs `changeset version` writes pass the release PR's pre-commit check without a root-installed formatter
