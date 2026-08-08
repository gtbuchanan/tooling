---
'@gtbuchanan/eslint-config': patch
---

Drop the now-unnecessary cast on the TSDoc flat config

eslint-plugin-jsdoc used to type its flat configs as arrays while
`recommended-tsdoc` was a single object at runtime, so reading it
required an `as unknown as Linter.Config` double cast. Upstream has
since corrected the types, making the cast a no-op that
`@typescript-eslint/no-unnecessary-type-assertion` now reports. Remove
the cast along with the stale comment explaining it.
