---
'@gtbuchanan/cli': minor
---

Release a workspace's `.github` package as a `v<version>` GitHub release

`gtb publish` tags a commit cut from HEAD in which every reference to the
repository's own `.github/` tree is pinned to that tag, so a caller pinned to
the release gets the actions and workflows it holds. The commit is built
through the Git Data API, so `GH_TOKEN` needs Workflows write.
