---
'@gtbuchanan/eslint-config': patch
'@gtbuchanan/vitest-config': patch
'@gtbuchanan/cli': patch
---

Publish runtime dependencies as caret ranges instead of exact pins

The `catalog:` entries backing these packages' runtime dependencies were
exact pins, and pnpm substitutes the catalog spec verbatim at publish
time — so consumers received hard pins that force a duplicate install
whenever they resolve a different version of the same package. Exact
pins remain only on root devDependencies, which are never published.
