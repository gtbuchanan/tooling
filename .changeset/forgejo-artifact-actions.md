---
'@gtbuchanan/github-workflows': patch
---

Run the `ci.yml` artifact steps on Forgejo and Gitea. The upstream `upload-artifact` and `download-artifact` refuse any server other than github.com, so off GitHub each step now uses ChristopherHX's v4 fork, which drops that check.
