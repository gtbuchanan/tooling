---
'@gtbuchanan/cli': minor
---

Add SARIF-based lint regression tooling: `lint:eslint` now writes a SARIF
log (`dist/eslint.sarif`) alongside its console output via a bundled
formatter, and the new `gtb lint:eslint:compare` command diffs each lint
cwd's current SARIF log against a baseline
(`dist/eslint-base.sarif`) using `sarif-multitool match-results-forward`,
failing only on violations not present in the baseline.
