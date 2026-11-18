---
'@gtbuchanan/hk-config': minor
---

Validate Codecov config at push time

`hooksFor` now also builds a `pre-push` hook, running the new
`Defaults.pushSteps`: steps that call the network, kept off the commit path.
The first is `codecov-config`, which checks the Codecov config against
Codecov's validator, catching the misspelled key Codecov would otherwise
silently ignore. `check` runs it too, so CI does. It needs `curl` 7.76 or later
on PATH, and an existing clone gets the `pre-push` hook once `hk install` runs
again, as `mise install` does.
