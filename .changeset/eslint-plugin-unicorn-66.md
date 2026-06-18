---
'@gtbuchanan/eslint-config': minor
---

Update bundled `eslint-plugin-unicorn` to v66

The recommended preset gains ~60 new rules (e.g. `max-nested-calls`,
`no-computed-property-existence-check`, `no-unreadable-new-expression`,
`prefer-short-arrow-method`, `require-array-sort-compare`,
`prefer-iterator-to-array`, `comment-content`). Two rules changed
identity: `no-array-for-each` was renamed to `no-for-each` and
`no-hex-escape` was dropped in favor of `prefer-unicode-code-point-escapes`.
Consumers linting with `--max-warnings=0` may surface new warnings and
should expect to address them when adopting this release.
