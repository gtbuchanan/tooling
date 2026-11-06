---
'@gtbuchanan/eslint-config': patch
---

Skip `.turbo`, `coverage` and `dist` when discovering nested `.gitignore` files

The walk doesn't apply the rules it loads, so it descended into build output,
and a concurrent build deleting one of those directories mid-walk failed config
loading with `ENOENT`. Passing your own `recursive.skipDirs` replaces this list.
