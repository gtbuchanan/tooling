---
'@gtbuchanan/cli': patch
---

Count only directories holding a `package.json` as workspace packages

That matches pnpm. A deleted package or a branch switch can leave a directory
holding only untracked `node_modules/` or `dist/`, which `gtb` discovered as a
package, so `gtb sync` could generate different config there than in a clean
checkout.
