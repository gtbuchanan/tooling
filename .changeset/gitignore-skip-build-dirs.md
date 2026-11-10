---
'@gtbuchanan/eslint-config': patch
---

Skip build output when discovering nested `.gitignore` files

The walk now skips `.turbo`, `coverage` and `dist`. It doesn't apply the rules
it loads, so it descended into build output, and a concurrent build deleting one
of those directories mid-walk failed config loading with `ENOENT`. Passing your
own `recursive.skipDirs` replaces this list.
