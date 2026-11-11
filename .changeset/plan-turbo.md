---
'@gtbuchanan/cli': minor
---

Report hand edits to the root `turbo.json` in `gtb verify`

`gtb verify` now fails when the root `turbo.json` differs in any way from what
`gtb sync` generates, not only when it lacks a task, since sync rewrites the
whole file. `--ignore <task>` still exempts a task.
