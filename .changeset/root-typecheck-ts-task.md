---
'@gtbuchanan/cli': patch
---

Generate typecheck:ts for TypeScript at the workspace root

A monorepo root routinely holds TypeScript of its own — `eslint.config.ts`,
`vitest.config.ts` — which the generated `//#lint:eslint` lints and nothing
type-checked, because `typecheck:ts` is a per-package task and the root is
not one of the packages.

`gtb sync` now emits a `//#typecheck:ts` root task and the root script
backing it, with the `typecheck` aggregate depending on it, matching how
`//#lint:eslint` and `//#deploy:skills` already work. No new tsconfig is
involved: sync's root `tsconfig.json` already carries `noEmit` and an
`include` covering root-level files.

The gate is the root's TypeScript **sources**, not its `tsconfig.json`.
Sync writes that file at every workspace root, so its presence says nothing
about whether there is anything to check — and a config whose `include`
matches no file is an error to tsc (`TS18003`), not a no-op. Discovery
therefore gained `hasTypeScriptSources`, which reports whether a directory
holds a TypeScript file the type-check `include` would reach.
