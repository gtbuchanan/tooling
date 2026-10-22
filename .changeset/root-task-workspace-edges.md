---
'@gtbuchanan/cli': patch
---

Make the generated root `//#lint:eslint` and `//#typecheck:ts` tasks depend on `^transit`. Without that edge, an edit to a workspace package the root consumes, such as its ESLint config or a shared tsconfig, replayed the root task's cached pass.
