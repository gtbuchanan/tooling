---
'@gtbuchanan/cli': patch
---

Hash the vendored CLI's sources into every task when self-hosted

Packages run gtb from source by relative path, so no task edge reached the
CLI, and some edits to it replayed stale cached results. The generated
`turbo.json` now lists its sources in `globalDependencies`.
