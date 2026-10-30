---
'@gtbuchanan/cli': patch
---

Stop generating `compile:skills` and `test:vitest:e2e` turbo tasks that no package runs: `compile:skills` when skills and publishing sit on different packages, and `test:vitest:e2e` (with the `test:e2e` aggregate and alias) when only a monorepo root has an e2e config. Such a repo's `E2E Test` job now fails on the missing task instead of passing with no tests; set `run-e2e: false` on the reusable CI workflow if it has no e2e tests to run.
