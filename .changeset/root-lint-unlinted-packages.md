---
'@gtbuchanan/cli': patch
---

Keep packages without their own ESLint config in the root lint

The root `lint:eslint` subtracted every workspace glob, so such a package's
files were linted by nothing. It now subtracts only the packages that run
their own `lint:eslint`.
