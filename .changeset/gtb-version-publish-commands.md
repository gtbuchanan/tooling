---
'@gtbuchanan/cli': minor
---

Add `gtb version` and fold npm publishing into `gtb publish`

`gtb version` runs `changeset version` then a `manifest`-scoped sync in one
process, so any regenerated native manifest (e.g. a Pkl `PklProject`) lands in
the same changesets version commit/PR. CD passes it as changesets/action's
`version` command — the chaining lives in `gtb` because the action splits its
`version` input on whitespace and execs it without a shell, so a `&&` chain is
passed to changesets as bogus args.

`gtb publish` now runs `changeset publish` (npm) before dispatching the non-npm
channels, making it the single publish command for a release. Both halves stay
idempotent and no-op when the workspace ships no such package.
