---
'@gtbuchanan/cli': patch
---

Lint the monorepo root through the `lint` and `check` aggregates

When only the root has an ESLint config, `//#lint:eslint` was generated but no
aggregate depended on it, so `check`, `build:ci` and `build` never linted the
root.
