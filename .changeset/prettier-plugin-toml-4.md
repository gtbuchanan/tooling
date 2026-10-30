---
'@gtbuchanan/eslint-config': minor
---

Update `prettier-plugin-toml` to v4, which formats TOML with tombi instead of taplo. Expect new `format/prettier` warnings on upgrade; `--fix` resolves them:

- TOML strings and quoted keys are double-quoted, TOML's own convention, rather than following the shared `singleQuote` used for JavaScript and YAML. A single-quoted string that would need escapes as a double-quoted one is left as it is.
- TOML keys are no longer sorted. Tombi has no option that replaces taplo's `reorderKeys`, so key order is preserved as written.
