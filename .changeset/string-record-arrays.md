---
'@gtbuchanan/cli': patch
---

A `package.json` whose `dependencies`, `scripts`, `exports` or another string map holds a JSON array is now rejected instead of being read as a map keyed by index.
