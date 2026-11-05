---
'@gtbuchanan/cli': patch
---

Run `hk fix --unstaged` at the end of `gtb version`

The CHANGELOGs `changeset version` writes then pass the release PR's
pre-commit check without a root-installed formatter.
