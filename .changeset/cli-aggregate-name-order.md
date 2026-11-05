---
'@gtbuchanan/cli': patch
---

Order each aggregate's `dependsOn` members by a fixed rule

Root tasks come first, then package tasks, each sorted by name. The next
`gtb sync` reorders the affected `turbo.json` arrays without changing which
tasks run.
