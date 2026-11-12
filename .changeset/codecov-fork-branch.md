---
'@gtbuchanan/cli': patch
---

Upload coverage from fork pull requests to Codecov

A fork's run has no Codecov token, and Codecov accepts a tokenless upload only
for a branch named `owner:branch`. `gtb task coverage:codecov:upload` now passes
the pull request's head label as the branch when its head repository differs
from its base, so Codecov stops refusing the upload as one to a protected
branch.
