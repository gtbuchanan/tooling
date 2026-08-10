---
'@gtbuchanan/cli': minor
---

Propagate workspace dependency source changes into `typecheck:ts` and
`test:vitest:*` caches

`typecheck:ts` declared no topological edge, so a change to a workspace
dependency's source left its consumers' type-check cache valid and CI
replayed a stale pass. `gtb sync` now emits a scriptless `transit` node
(`dependsOn: ["^transit"]`) and depends on it from `typecheck:ts`,
`test:vitest:fast`, and `test:vitest:slow`. It runs nothing, so nothing
serializes; it just carries every transitive workspace dependency's file
hashes into the consumer's task hash — including dependencies with no
`compile:ts` script, which `^compile:ts` could never reach.

The test tasks' topological edge also moves from the `compile:ts` leaf to
the `compile` aggregate, so a dependency whose output comes from another
compile flavour (`compile:skills`) gates its consumers too.

Re-run `gtb sync` after upgrading — `gtb verify` reports drift until
`turbo.json` is regenerated. No package needs a `transit` script.
