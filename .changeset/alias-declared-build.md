---
'@gtbuchanan/cli': patch
---

Alias the root `build` script whenever `turbo.json` declares the `build` aggregate. A monorepo whose only build step is `deploy:skills` now gets the alias, and `gtb verify` reports a `build` script in a single-package repo of that shape.
