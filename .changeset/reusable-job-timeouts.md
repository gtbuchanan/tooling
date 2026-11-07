---
'@gtbuchanan/github-workflows': patch
---

Set `timeout-minutes` on every reusable job, so a hung job is cancelled instead of holding a runner for GitHub's 6-hour default: 30 minutes for Build, E2E Test and Slow Tests, and 10–15 for the rest.
