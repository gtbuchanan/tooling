---
'@gtbuchanan/github-workflows': patch
---

Grant `pull-requests: write` only to the `Dependency Review` job

That job posts the PR comment, and `dependency-review.yml`'s workflow level now
grants nothing. Existing callers keep working. The documented `pr.yml` now gives
that scope to the `Dependencies` job alone, so a consumer can narrow their copy
the same way.
