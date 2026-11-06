---
'@gtbuchanan/github-workflows': patch
---

Grant `pull-requests: write` in `dependency-review.yml` only to the `Dependency Review` job, which posts the PR comment; the workflow level now grants nothing. Existing callers keep working. The documented `pr.yml` now gives that scope to the `Dependencies` job alone, so a consumer can narrow their copy the same way.
