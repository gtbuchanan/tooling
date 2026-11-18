---
'@gtbuchanan/pnpm-termux-shim': patch
---

Run pnpm 11 and later, whose entry point is `bin/pnpm.mjs`

The shim ran `bin/pnpm.cjs`, which pnpm 11 removed, so every `pnpm` call
through it failed with `Cannot find module`. It now runs `bin/pnpm.mjs` and
falls back to `bin/pnpm.cjs` for pnpm 10 and earlier.
