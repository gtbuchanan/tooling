---
'@gtbuchanan/cli': minor
---

Rework lint enforcement around SARIF baselining. `lint:eslint` is now a
reporter: it writes `dist/eslint.sarif` via a bundled formatter, prints
compact console output, and no longer fails on warnings (fatal errors
still fail). Enforcement moves to the new `gtb lint:eslint:compare`
command, which classifies each violation against a baseline SARIF log
using `sarif-multitool` and fails only on violations not present in the
baseline. With `--base <ref>` it produces the baseline itself by linting
the merge base in a temporary git worktree, so the same command works
locally and in CI (see the new `lint-regression.yml` reusable workflow).
Local changed-file enforcement via the pre-commit ESLint step is
unaffected.
