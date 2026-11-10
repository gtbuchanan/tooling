---
'@gtbuchanan/github-workflows': patch
---

Add a `version-check` composite action

It holds `dependency-review.yml`'s Version Check script as a shell file. The
Version Check job now runs through it, with no change in what it checks.
