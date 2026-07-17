---
'@gtbuchanan/hk-config': patch
---

Bump the bundled hk `Config`/`Builtins` import to 1.51.0

hk 1.51 reworked two builtin schemas the preset builds on:

- Builtins now expose commands as structured argv (`Config.Command`)
  rather than shell strings. The actionlint step reads the builtin's
  command into a per-OS `Script` (string-only), so it joins the argv
  back into a string.
- The `shellcheck`/`shfmt` builtins select files via `match_any`, whose
  `sh`/`bash` type clause over-matches non-shell files (markdown, JSON,
  YAML). The preset clears `match_any` and keeps selecting by the
  narrower `shell` content type, which hk 1.51 also requires (it rejects
  `match_any` combined with a top-level `types`).
