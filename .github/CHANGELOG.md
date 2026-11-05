# @gtbuchanan/github-workflows

## 1.0.0

### Major Changes

- d60fe3e: Release the reusable workflows and composite actions as `v<version>`

  A caller pinned to a release, such as `ci.yml@v1.0.0`, gets every action and
  nested workflow from that same release.

  `cd.yml` publishes with the GitHub App token, narrowed per job to what that
  job writes. Both tokens ask for Workflows write, so the App needs it in every
  calling repository, and a caller grants CD `contents: read` rather than
  `contents: write`.

  Both jobs run in the `release` environment, so `APP_PRIVATE_KEY` can be an
  environment secret limited to the default branch, out of reach of pull
  request runs; a repository secret still works. Protection rules on `release`
  now gate the version job too.
