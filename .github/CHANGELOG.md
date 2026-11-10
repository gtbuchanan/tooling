# @gtbuchanan/github-workflows

## 1.1.0

### Minor Changes

- 61affda: Run the reusable jobs on `ubuntu-24.04` instead of `ubuntu-latest`

  On Forgejo, a job waits for a runner that registers this label, so register it
  before updating.

### Patch Changes

- 24a1049: Document that `cd.yml` callers must pass `APP_PRIVATE_KEY` by name

  The value comes from the `release` environment, but only for a secret name the
  caller passed, so a call that passes no secrets leaves the App token step
  without a key.
- f9f3528: Fail the `Codecov Upload` job when the upload fails

  It used to pass regardless, which hid failures from a repository that doesn't
  require Codecov's statuses.
- 81cce42: Reference `actions/dependency-review-action` by its `v5.0.0` tag

  Its `v5` ref is a branch, which Renovate can't pin to a version.
- 9edb861: Grant `pull-requests: write` only to the `Dependency Review` job

  That job posts the PR comment, and `dependency-review.yml`'s workflow level now
  grants nothing. Existing callers keep working. The documented `pr.yml` now gives
  that scope to the `Dependencies` job alone, so a consumer can narrow their copy
  the same way.
- 5b01bef: Drop `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` from the reusable workflows

  Node.js 24 has been the default JavaScript action runtime since GitHub removed
  Node.js 20, so the variable no longer does anything.
- 208d25e: Set `shell: bash` on every `run:` step of the reusable workflows

  jactionlint's `pedantic` profile requires it. Those steps now also run with
  `pipefail` and without the shell's profile and rc files.
- f381c2a: Run `ci.yml`'s artifact steps on Forgejo and Gitea

  The upstream `upload-artifact` and `download-artifact` refuse any server other
  than github.com. The steps now go through new `upload-artifact` and
  `download-artifact` composite actions. These run the upstream actions on
  github.com and, everywhere else, ChristopherHX's v4 forks, which drop that
  check.
- dcd38f0: Stop expanding inputs into `run:` script text

  `inputs.gtb-from-source` and `pnpm-resolve-pinned`'s `package` input now reach
  their scripts through environment variables. A `package` value holding shell
  syntax could previously run as a command in the caller's job.
- 46628e8: Key the `mise-setup` cache by OS release as well as architecture

  A runner image change no longer restores tools installed on the previous image.
  The first run after updating installs every tool again.
- 3d999b8: Pass the job token to mise only on github.com

  On Forgejo and Gitea, `github.token` is the forge's own token, which GitHub
  rejects, so `mise-setup` no longer sends it there. The `MISE_GITHUB_TOKEN`
  preset that worked around jdx/mise-action#292 is gone, since mise-action v5
  authenticates its own GitHub API calls.
- 0b04f55: Install mise v2026.11.0 in `mise-setup`

  `mise-setup` sets `MISE_LOCKED=1`, and from this release locked installs fail
  before downloading when a `mise.lock` entry for the runner's platform has a URL
  but no checksum. If your lockfile was written by hand or by an older mise, run
  `mise lock` once to fill in the checksums.
- 9e9e9e7: Run `jdx/mise-action` v5.2.6 in `mise-setup`
- 0fcc3e3: Pin the third-party actions to commits

  This covers the reusable workflows and composite actions, each pin carrying the
  full version in a comment.
- 3da86f6: Set `timeout-minutes` on every reusable job

  A hung job is now cancelled instead of holding a runner for GitHub's 6-hour
  default: 30 minutes for Build, E2E Test and Slow Tests, and 10–15 for the rest.
- 1d83cfb: Add a `version-check` composite action

  It holds `dependency-review.yml`'s Version Check script as a shell file. The
  Version Check job now runs through it, with no change in what it checks.
- 7adf714: Wrap every `if:` condition in `${{ }}`

  This covers the reusable workflows and composite actions, as jactionlint's
  `pedantic` profile requires. Each condition evaluates as before.

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
