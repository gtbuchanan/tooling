---
'@gtbuchanan/cli': minor
---

Write `lint:eslint` findings as a SARIF log

`gtb task lint:eslint` prints the same `stylish` report and also writes its
findings to `dist/findings/eslint.sarif`, marked partial when the task's
arguments may leave findings out. A `--format` of your own writes no log.

`eslint` is now an optional peer dependency, at `>=9.0.0`.
