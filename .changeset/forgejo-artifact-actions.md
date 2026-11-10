---
'@gtbuchanan/github-workflows': patch
---

Run `ci.yml`'s artifact steps on Forgejo and Gitea

The upstream `upload-artifact` and `download-artifact` refuse any server other
than github.com. The steps now go through new `upload-artifact` and
`download-artifact` composite actions. These run the upstream actions on
github.com and, everywhere else, ChristopherHX's v4 forks, which drop that
check.
