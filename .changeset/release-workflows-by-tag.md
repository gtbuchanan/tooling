---
'@gtbuchanan/cli': minor
'@gtbuchanan/github-workflows': major
---

Release the reusable workflows and composite actions as `v<version>` tags. `gtb publish` releases a workspace's `.github/` package on a commit cut from HEAD, in which every reference to the repository's own `.github/` tree is pinned to that tag. A caller pinned to a release therefore gets the actions, nested workflows and config the release itself holds. The commit is reachable only through its tag, because the default branch keeps `@main` so its own CI can resolve what it references.

The CD publish job now cuts releases with the GitHub App token instead of the job token, so a caller grants CD `contents: read` rather than `contents: write`. Each job's App token is narrowed to the permissions that job writes with, and both ask for Workflows write, so the App needs Workflows write in every repository that calls `cd.yml`. Token creation fails where it lacks it. The version job now runs in the `release` environment too, so both jobs can read `APP_PRIVATE_KEY` as an environment secret limited to the default branch, out of reach of pull request runs. Protection rules on `release` therefore gate the version job as well: a required reviewer or wait timer now holds up the release PR on every push to the default branch, not only publishing. A repository secret passed with `secrets: inherit` or by name still works.
