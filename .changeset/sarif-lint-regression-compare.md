---
'@gtbuchanan/cli': minor
---

Rework lint enforcement as a SARIF ratchet. Lint tasks are now
reporters: `lint:eslint` writes `dist/sarif/eslint.sarif` and no
longer fails on warnings (fatal errors still fail). The new
`gtb sarif compare` command fails only on findings that are new
relative to the merge base, and `gtb sarif baseline` snapshots HEAD's
logs so CI can seed a cross-PR baseline cache — see the new
`lint-regression.yml` and `lint-baseline.yml` reusable workflows.
