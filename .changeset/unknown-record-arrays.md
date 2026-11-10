---
'@gtbuchanan/cli': patch
---

A tsconfig, or any other JSON config gtb reads as an object, that holds a JSON array is now reported instead of being treated as an object keyed by index. `gtb sync` would otherwise have rewritten such a tsconfig with `"0"`, `"1"`, … keys.
