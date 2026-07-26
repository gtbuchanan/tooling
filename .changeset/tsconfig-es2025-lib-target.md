---
'@gtbuchanan/tsconfig': minor
---

Raise `lib` and `target` to ES2025 in `node.json` to match the Node 24
engine floor, so lint rules that assume ES2025 APIs (e.g.
`unicorn/prefer-set-methods` suggesting `Set#difference`) compile
without suppressions, and declare the `typescript` peer range this
requires (`>=6.0.0`, the first release accepting `es2025`)
