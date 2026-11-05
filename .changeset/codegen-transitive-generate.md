---
'@gtbuchanan/cli': major
---

Chain the monorepo `generate` aggregate through `^generate`

Codegen in a transitive workspace dependency now runs before the tasks that
read it. `gtb verify` requires each package configuration's `generate` task to
keep that edge: add `"$TURBO_EXTENDS$"` as the first entry of its `dependsOn`.

The marker needs turbo 2.7 or later, now an optional peer dependency. On older
turbo, list `"^generate"` in that `dependsOn` instead.
