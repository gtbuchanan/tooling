---
'@gtbuchanan/eslint-config': patch
---

Describe the SARIF findings log in the `gtb-eslint-config` skill

The skill now says that `gtb task lint:eslint` also writes its findings to
`dist/findings/eslint.sarif`, beside the cache under each package's `dist/`.
