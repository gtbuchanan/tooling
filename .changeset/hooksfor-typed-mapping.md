---
'@gtbuchanan/hk-config': patch
---

Annotate the mapping `hooksFor` builds, so amending a hook keeps the preset's steps

The evaluator hk embeds merges into an existing Mapping entry only where it
recorded the Mapping's value type, which a bare `new { ... }` does not. A
consumer amending one hook therefore rebuilt that hook from the amendment
alone and silently lost every preset step — `check` running one step and
exiting 0. Consumers carrying the re-spread workaround
(`steps { ...allSteps ["extra"] = extraStep }`) can drop it.
