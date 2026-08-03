---
'@gtbuchanan/cli': minor
---

Rework lint enforcement as a SARIF ratchet. Lint tasks are now
reporters: `lint:eslint` runs ESLint through its programmatic API
(`eslint` becomes an optional peer dependency), writing
`dist/sarif/eslint.sarif` and a stylish console report from one lint
run; it no longer fails on warnings (errors still fail) and accepts
only its supported argument surface (patterns, `--fix`,
`--ignore-pattern`). The new `gtb sarif compare` command fails only on
findings that are new relative to the merge base — reported in the
same stylish layout as lint output — and `gtb sarif baseline`
snapshots HEAD's logs so CI can seed a cross-PR baseline cache — see
the new `lint-regression.yml` and `lint-baseline.yml` reusable
workflows.
