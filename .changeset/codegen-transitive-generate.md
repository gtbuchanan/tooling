---
'@gtbuchanan/cli': minor
---

Chain the monorepo `generate` aggregate through `^generate`, so codegen in a transitive workspace dependency runs before the tasks that read it. `gtb verify` now requires each package configuration's `generate` task to keep that edge: add `"$TURBO_EXTENDS$"` as the first entry of its `dependsOn`.
