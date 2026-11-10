---
'@gtbuchanan/cli': patch
---

Reject JSON arrays where gtb reads an object

A `package.json` whose `dependencies`, `scripts`, `exports` or another string
map holds an array, or a tsconfig or other JSON config holding one where gtb
expects an object, is now reported instead of being read as an object keyed by
index. `gtb sync` would otherwise have rewritten such a tsconfig with `"0"`,
`"1"`, … keys.
