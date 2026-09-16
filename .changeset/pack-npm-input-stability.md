---
'@gtbuchanan/cli': patch
---

Stop hashing the compiled output directory into `pack:npm`

Turbo folds a dependency's task hash into its dependents, so the generated
`compile:ts` and `compile:skills` edges already key `pack:npm` to the sources
that produce what it packs. Listing `dist/source/**` on top of that also keyed
it to whatever a prior run left on disk, so one source state hashed one way in
a warm tree and another on a fresh checkout — spurious cache misses, with no
correctness to show for them.
