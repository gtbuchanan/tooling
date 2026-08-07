---
---

Add an `.editorconfig` so editors match the repo's existing conventions
(UTF-8, LF, two-space indent, final newline, trimmed trailing whitespace)
without each contributor configuring them by hand.

`max_line_length` is scoped to script files, where `@stylistic/max-len`
enforces the same limit. Markdown, YAML, JSON, and TOML have no enforcer —
markdownlint's `line-length` is deliberately disabled — and all contain
lines well past it, so a repo-wide value would either be ignored or, in
editors that hard-wrap on the property, corrupt tables and expressions.
The lockfile section mirrors the exclude already wired onto hk's
file-hygiene steps.
