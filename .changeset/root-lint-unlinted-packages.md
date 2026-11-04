---
'@gtbuchanan/cli': patch
---

Keep a workspace package that has no ESLint config of its own in the root `lint:eslint`. The root lint used to subtract every workspace glob, so such a package's files were linted by nothing. It now subtracts only the packages that run their own `lint:eslint`, spelling them out individually where a glob also matches one that doesn't.
