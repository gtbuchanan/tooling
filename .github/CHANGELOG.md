# @gtbuchanan/github-workflows

## 1.0.1

### Patch Changes

- 81cce42: Reference `actions/dependency-review-action` by its `v5.0.0` tag. Its `v5` ref is a branch, which Renovate can't pin to a version.
- 9edb861: Grant `pull-requests: write` in `dependency-review.yml` only to the `Dependency Review` job, which posts the PR comment; the workflow level now grants nothing. Existing callers keep working. The documented `pr.yml` now gives that scope to the `Dependencies` job alone, so a consumer can narrow their copy the same way.
- 5b01bef: Drop `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` from the reusable workflows. Node.js 24 has been the default JavaScript action runtime since GitHub removed Node.js 20, so the variable no longer does anything.
- f381c2a: Run the `ci.yml` artifact steps on Forgejo and Gitea. The upstream `upload-artifact` and `download-artifact` refuse any server other than github.com, so off GitHub each step now uses ChristopherHX's v4 fork, which drops that check.
- dcd38f0: Pass `inputs.gtb-from-source` and `pnpm-resolve-pinned`'s `package` input to their `run:` scripts through environment variables instead of expanding them into the script text. A `package` value holding shell syntax could previously run as a command in the caller's job.
- 3d999b8: Pass the job token to mise only on github.com. On Forgejo and Gitea, `github.token` is the forge's own token, which GitHub rejects, so `mise-setup` no longer sends it there. The `MISE_GITHUB_TOKEN` preset that worked around jdx/mise-action#292 is gone, since mise-action v5 authenticates its own GitHub API calls.
- 0b04f55: Install mise v2026.11.0 in `mise-setup`

  `mise-setup` sets `MISE_LOCKED=1`, and from this release locked installs fail
  before downloading when a `mise.lock` entry for the runner's platform has a URL
  but no checksum. If your lockfile was written by hand or by an older mise, run
  `mise lock` once to fill in the checksums.
- 9e9e9e7: Run `jdx/mise-action` v5.2.6 in `mise-setup`
- 0fcc3e3: Pin the third-party actions in the reusable workflows and composite actions to commits, with the full version in a comment.
- 3da86f6: Set `timeout-minutes` on every reusable job, so a hung job is cancelled instead of holding a runner for GitHub's 6-hour default: 30 minutes for Build, E2E Test and Slow Tests, and 10–15 for the rest.

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
