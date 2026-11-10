---
'@gtbuchanan/github-workflows': patch
---

Fail the `Codecov Upload` job when the upload fails

It used to pass regardless, which hid failures from a repository that doesn't
require Codecov's statuses.
