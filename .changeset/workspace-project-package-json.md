---
'@gtbuchanan/cli': patch
---

Count only directories holding a `package.json` as workspace packages, the way pnpm does. A deleted package or a branch switch leaves the old directory behind with only untracked `node_modules/` or `dist/` in it. `gtb` used to discover that leftover as a package, so `gtb sync` could generate different config in that checkout than in a clean one.
