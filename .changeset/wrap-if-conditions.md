---
'@gtbuchanan/github-workflows': patch
---

Wrap every `if:` condition in the reusable workflows and composite actions in `${{ }}`, as jactionlint's `pedantic` profile requires. Each condition evaluates as before.
