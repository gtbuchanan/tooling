---
'@gtbuchanan/github-workflows': patch
---

Run `jdx/mise-action` v5.3.0 in `mise-setup`

Installing mise no longer fails on a Windows runner whose `MISE_DATA_DIR` sits
on another drive than the temp directory, or whose `PATH` finds an MSYS
`curl.exe` first, and a failed mise download now logs its HTTP status and
retries for longer.
