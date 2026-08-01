---
'@gtbuchanan/cli': minor
---

`gtb publish` now creates a GitHub release for every published npm package
(title = tag, notes = the version's CHANGELOG section), landing the release
tag on GitHub via the API — previously `changeset publish` created tags only
in the runner's local clone, so npm releases shipped untagged. Both release
channels (npm and Pkl) now also pass `--target HEAD` so a local re-run tags
the commit actually being published rather than the remote default branch.
