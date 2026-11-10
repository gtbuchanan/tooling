---
'@gtbuchanan/github-workflows': patch
---

Wrap every `if:` condition in `${{ }}`

This covers the reusable workflows and composite actions, as jactionlint's
`pedantic` profile requires. Each condition evaluates as before.
