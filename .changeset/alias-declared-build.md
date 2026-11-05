---
'@gtbuchanan/cli': patch
---

Alias the root `build` script whenever `turbo.json` declares `build`

A monorepo whose only build step is `deploy:skills` now gets the alias, and
`gtb verify` expects one in a single-package repo of that shape.
