---
'@gtbuchanan/github-workflows': minor
---

Run the reusable jobs on `ubuntu-26.04`

On Forgejo, a job waits for a runner that registers this label, so register it
before updating. The first run on the new image restores no `mise-setup` cache,
since that cache is keyed on the OS release.
