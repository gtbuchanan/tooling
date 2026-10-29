---
'@gtbuchanan/hk-config': minor
---

Replace the actionlint step with jactionlint

rhysd/actionlint has stopped releasing, and its runner labels are
hardcoded, so every runner GitHub adds becomes a `runner-label` error.
The preset's workflow-lint step now wraps hk's `Builtins.jactionlint`
(jdx/jactionlint, the maintained fork), which also lints composite
actions and Dependabot config.

The step runs jactionlint's `correctness` profile, the checks actionlint
made. The `--profile` flag overrides the `profile` of a repo's
`.github/jactionlint.yaml`, so a repo wanting the `default` or
`pedantic` profile amends the step's argv.

Breaking for consumers:

- The step key in `recommended` and the export are renamed from
  `actionlint` to `jactionlint`. Rename any amendment of the step and any
  `-S actionlint` / `--skip-step actionlint`.
- The binary is `jactionlint`. Swap the mise `actionlint` pin for
  `jactionlint` (backend `github:jdx/jactionlint`).
- Shellcheck now runs on Windows too. The Windows-only `-shellcheck=`
  guard worked around a deadlock on large `run:` scripts that jactionlint
  has fixed, so run-script findings that only Linux reported before now
  appear on Windows as well.
