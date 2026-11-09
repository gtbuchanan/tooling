---
'@gtbuchanan/github-workflows': patch
---

Document that a caller of `cd.yml` must pass `APP_PRIVATE_KEY` by name. The value comes from the `release` environment, but only for a secret name the caller passed, so a call that passes no secrets leaves the App token step without a key.
