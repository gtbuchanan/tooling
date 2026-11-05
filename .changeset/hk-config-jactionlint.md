---
'@gtbuchanan/hk-config': minor
---

Replace the actionlint step with jactionlint

rhysd/actionlint has stopped releasing, and its hardcoded runner labels turn
every new GitHub runner into a `runner-label` error. The step now wraps hk's
`Builtins.jactionlint` (jdx/jactionlint, the maintained fork), which also
lints composite actions and Dependabot config. It runs the `correctness`
profile, the checks actionlint made, and `--profile` overrides a repo's
`.github/jactionlint.yaml`, so amend the step's argv to run another.

Breaking:

- The step key in `recommended` and the export are renamed from `actionlint`
  to `jactionlint`. Rename any amendment and any `-S actionlint` or
  `--skip-step actionlint`.
- Swap the mise `actionlint` pin for `jactionlint` (`github:jdx/jactionlint`).
- Shellcheck now runs on Windows too, so run-script findings that only Linux
  reported appear there as well.
