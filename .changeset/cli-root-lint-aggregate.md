---
'@gtbuchanan/cli': patch
---

Run the root's `//#lint:eslint` through the `lint` and `check` aggregates when only the monorepo root has an ESLint config. Previously the task was generated but no aggregate depended on it, so `check`, `build:ci` and `build` never linted the root.
