---
'@gtbuchanan/cli': minor
---

Rework lint enforcement around tool-agnostic SARIF baselining.
`lint:eslint` is now a reporter: it writes `dist/sarif/eslint.sarif`
via a bundled formatter, prints compact console output, and no longer
fails on warnings (fatal errors still fail). Enforcement moves to the
new `gtb sarif compare` command, which pairs every `dist/sarif/*.sarif`
with `dist/sarif/base/<name>.sarif` and fails only on findings the
`sarif-multitool` baseliner classifies as new — any tool that drops a
SARIF log into `dist/sarif/` is gated with no extra wiring. A missing
baseline counts as empty (all findings new), and findings carrying
in-source suppressions are exempt. With
`--base <ref>` it produces the baseline itself by linting the merge
base in a temporary git worktree, skipping production when the
`dist/sarif/base.ref` stamp already records that merge base (locally or
via CI caches). `gtb sarif baseline` snapshots HEAD's logs as the
baseline so default-branch CI can seed a cross-PR cache (see the new
`lint-regression.yml` reusable workflow). Local changed-file
enforcement via the pre-commit ESLint step is unaffected.
