---
'@gtbuchanan/cli': patch
---

`gtb changeset check` now reads the base catalog at HEAD's merge base with `--since`, matching `changeset status`. A catalog bump that landed on the base after the branch forked no longer reads as the branch reverting it.
