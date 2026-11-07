---
'@gtbuchanan/cli': patch
---

Write tsconfigs only for a workspace holding TypeScript

`gtb sync` scaffolded `tsconfig.base.json` and the root tsconfigs in every workspace depending on the CLI, TypeScript or not. It now writes them only where a package is configured for TypeScript or the root holds TypeScript files. Files an earlier sync wrote are left in place.
