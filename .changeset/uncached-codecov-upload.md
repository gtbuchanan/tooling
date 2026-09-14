---
'@gtbuchanan/cli': minor
---

Upload coverage to Codecov on every run

`coverage:codecov:upload` is now generated with `cache: false` and no
`inputs`/`outputs`, so turbo runs it every time instead of skipping packages
whose coverage hasn't moved.

Caching it meant a commit that moved no coverage uploaded nothing, so Codecov
held no report for that commit and posted no status — and a status check that
never reports blocks a pull request permanently. Uploading every run is what
makes `codecov/project` and `codecov/patch` dependable enough to require in
branch protection. The cost is one Codecov CLI invocation per package per run.

The upload also passes `--disable-telem`, whose flush otherwise holds the
process open at the end of each upload.

Re-run `gtb sync turbo` to pick up the task change.
