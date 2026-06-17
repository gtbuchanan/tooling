---
'@gtbuchanan/eslint-config': patch
---

Scope CHANGELOG duplicate-heading lint to siblings only

`markdown/no-duplicate-headings` now uses `checkSiblingsOnly` for
`**/CHANGELOG.md`, so the `### Minor Changes` / `### Patch Changes`
sections that changesets repeats across version headings no longer trip
the rule (it still flags genuine duplicate siblings within one section).
Authored Markdown keeps full duplicate-heading enforcement.
