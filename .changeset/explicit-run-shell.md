---
'@gtbuchanan/github-workflows': patch
---

Set `shell: bash` on every `run:` step of the reusable workflows, as jactionlint's `pedantic` profile requires. Those steps now also run with `pipefail` and without the shell's profile and rc files.
