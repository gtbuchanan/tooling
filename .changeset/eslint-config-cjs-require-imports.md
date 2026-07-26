---
'@gtbuchanan/eslint-config': minor
---

Allow `require()` in `.cjs` files

The `.cjs` extension forces CommonJS, so `require()` is the only way to
import — `import` is a syntax error there. Every consumer with a `.cjs`
file (a script stub, `.pnpmfile.cjs`, etc.) had to turn
`@typescript-eslint/no-require-imports` off itself.

Also exports the `cjsFiles` glob so consumers can scope their own `.cjs`
overrides to the same pattern.
