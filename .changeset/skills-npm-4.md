---
'@gtbuchanan/cli': major
---

Require `skills-npm` v4 as the optional peer dependency. `gtb prepare` and `deploy:skills` are now tested only against v4, so upgrade with `pnpm add -D skills-npm@^4`. v4 writes a `skills-npm-lock.json` at the workspace root on every install; add it to `.gitignore` alongside `skills-lock.json`.
