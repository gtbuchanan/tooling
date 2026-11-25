---
'@gtbuchanan/cli': minor
---

Write `lint:eslint` findings as a SARIF log

`gtb task lint:eslint` now runs ESLint with a formatter of its own, which
prints the same `stylish` report as before and writes the findings to
`dist/findings/eslint.sarif`, a turbo output of the task, with locations
relative to the git repository root. Findings suppressed by a directive or by
ESLint's bulk suppressions file appear in the log marked as suppressed. A
`--format` passed to the task replaces gtb's formatter, and no log is written.

`eslint` is now an optional peer dependency, at `>=9.0.0`.
