---
'@gtbuchanan/eslint-config': minor
---

Update `prettier-plugin-toml` to v4, which formats TOML with tombi

Expect new `format/prettier` warnings, which `--fix` resolves:

- Strings and quoted keys are double-quoted, TOML's own convention, rather
  than following the shared `singleQuote`. A string that would need escapes
  stays single-quoted.
- Keys are no longer sorted: tombi has no equivalent of taplo's `reorderKeys`.
