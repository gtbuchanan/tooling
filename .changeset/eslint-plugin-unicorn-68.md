---
'@gtbuchanan/eslint-config': minor
---

Update bundled `eslint-plugin-unicorn` to v68

The recommended preset gains many new rules across v66, v67, and v68,
crossing 300 rules. Several rules changed identity: `no-array-for-each`
was renamed to `no-for-each`, `no-hex-escape` was dropped in favor of
`prefer-unicode-code-point-escapes`, and `prevent-abbreviations` was
renamed to `name-replacements` (kept disabled pending a future allowlist).
The new `no-nonstandard-builtin-properties` rule is disabled because it
flags the standard `Symbol.dispose`/`Symbol.asyncDispose` (Explicit
Resource Management) without an allowlist option to permit them. Consumers
linting with `--max-warnings=0` may surface new warnings and should expect
to address them when adopting this release.
