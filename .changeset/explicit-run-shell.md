---
'@gtbuchanan/github-workflows': patch
---

Set `shell: bash` on every `run:` step of the reusable workflows

jactionlint's `pedantic` profile requires it. Those steps now also run with
`pipefail` and without the shell's profile and rc files.
