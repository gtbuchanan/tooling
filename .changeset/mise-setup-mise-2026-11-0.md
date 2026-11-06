---
'@gtbuchanan/github-workflows': patch
---

Install mise v2026.11.0 in `mise-setup`

`mise-setup` sets `MISE_LOCKED=1`, and from this release locked installs fail
before downloading when a `mise.lock` entry for the runner's platform has a URL
but no checksum. If your lockfile was written by hand or by an older mise, run
`mise lock` once to fill in the checksums.
