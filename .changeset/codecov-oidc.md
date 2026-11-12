---
'@gtbuchanan/github-workflows': major
---

Upload coverage to Codecov with GitHub OIDC instead of CODECOV_TOKEN

`ci.yml`'s `Codecov Upload` job now requests `id-token: write`, so the job
calling `ci.yml` must grant it alongside `contents: read`, or GitHub rejects the
run before it starts. On github.com the upload then authenticates with an OIDC
token, and the `CODECOV_TOKEN` secret can be deleted once the caller stops
passing it.

A `CODECOV_TOKEN` the caller still passes takes precedence. Codecov trusts only
GitHub's OIDC issuer, so callers on Forgejo keep passing the secret; Forgejo
ignores the permission grant.
