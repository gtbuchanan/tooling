---
'@gtbuchanan/github-workflows': minor
---

Run the reusable jobs on `ubuntu-24.04` instead of `ubuntu-latest`. On Forgejo, a job waits for a runner that registers this label, so register it before updating.
