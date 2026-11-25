---
'@gtbuchanan/cli': minor
---

Bundle published packages holding a `tsdown.config.*` with `compile:tsdown`

The new leaf replaces `compile:ts` for that package, so a published package can
inline a private workspace package rather than import one no registry holds.
It writes to `dist/source` with tsc's extensions and a source map, so existing
`publishConfig` paths keep working. The package needs `tsdown` among its
`devDependencies`.

`compile:ts` now waits on `^compile` rather than `^compile:ts`, so it also
waits on a dependency bundled by tsdown. Run `gtb sync` to update `turbo.json`.
