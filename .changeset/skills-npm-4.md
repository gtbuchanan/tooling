---
'@gtbuchanan/cli': major
---

Require `skills-npm` v4 as the optional peer dependency

Upgrade with `pnpm add -D skills-npm@^4`. v4 writes a `skills-npm-lock.json`
at the workspace root on every install; add it to `.gitignore` beside
`skills-lock.json`.
