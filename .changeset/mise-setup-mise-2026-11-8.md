---
'@gtbuchanan/github-workflows': patch
---

Install mise v2026.11.8 in `mise-setup`

`mise-setup` sets `MISE_LOCKED=1`, and from this release a locked install also
rejects a `vfox:` tool download whose checksum differs from its `mise.lock`
entry.
