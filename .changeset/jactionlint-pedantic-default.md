---
'@gtbuchanan/hk-config': minor
---

Lint workflows at jactionlint's `pedantic` profile by default, in `jactionlint` and so in `recommended`. Workflows that passed at `correctness` can now fail the hook, and `hk fix` applies the new rules' autofixes. Fix the findings, exempt a deliberate design in `.github/jactionlint.yaml`, or keep the old behaviour with `jactionlintWith("correctness")`.
