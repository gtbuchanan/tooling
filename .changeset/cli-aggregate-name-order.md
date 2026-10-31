---
'@gtbuchanan/cli': patch
---

List each aggregate's `dependsOn` members in a fixed order: root tasks first, then package tasks, each sorted by name. The next `gtb sync` reorders the affected `turbo.json` arrays without changing which tasks run.
