---
'@gtbuchanan/cli': major
---

Stop generating turbo tasks no package runs

`compile:skills` is no longer generated when skills and publishing sit on
different packages, nor `test:vitest:e2e`, with its `test:e2e` aggregate and
alias, when only a monorepo root has an e2e config.

Such a repo's `E2E Test` job now fails on the missing task instead of passing
with no tests. Set `run-e2e: false` on the reusable CI workflow if the repo
has no e2e tests.
