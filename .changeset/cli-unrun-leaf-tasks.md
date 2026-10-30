---
'@gtbuchanan/cli': patch
---

Stop generating `compile:skills` and `test:vitest:e2e` turbo tasks that no package runs: `compile:skills` when skills and publishing sit on different packages, and `test:vitest:e2e` (with the `test:e2e` aggregate and alias) when only a monorepo root has an e2e config.
