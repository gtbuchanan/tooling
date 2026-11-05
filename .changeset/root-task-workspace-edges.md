---
'@gtbuchanan/cli': patch
---

Make the root's lint and type-check tasks depend on `^transit`

Without that edge, an edit to a workspace package the root consumes, such as
its ESLint config or a shared tsconfig, replayed the root task's cached pass.
