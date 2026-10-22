---
'@gtbuchanan/cli': patch
---

List the vendored CLI's sources in the generated `turbo.json`'s `globalDependencies` when self-hosted. Packages there run gtb from source by relative path, so no task edge reached the CLI, and some edits to it replayed stale cached results in every other package.
