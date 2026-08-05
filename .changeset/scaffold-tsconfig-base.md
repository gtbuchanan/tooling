---
'@gtbuchanan/cli': minor
---

Scaffold `tsconfig.base.json` in `gtb sync` and verify its presence

`gtb sync` generates configs that extend `./tsconfig.base.json` but
never created it, leaving a fresh consumer silently broken. Sync now
scaffolds the base (extending `@gtbuchanan/tsconfig/node.json`) when
absent — never overwriting an edited variant — and `gtb verify` reports
drift when it's missing.
