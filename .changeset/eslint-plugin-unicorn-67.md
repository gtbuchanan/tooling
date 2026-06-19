---
'@gtbuchanan/eslint-config': minor
---

Update bundled `eslint-plugin-unicorn` to v67

The recommended preset gains many new rules across v66 and v67 — e.g.
`max-nested-calls`, `no-computed-property-existence-check`,
`prefer-short-arrow-method`, `require-array-sort-compare`,
`prefer-iterator-to-array`, `no-non-function-verb-prefix`,
`no-invalid-argument-count`, `operator-assignment`, `prefer-else-if`,
and `prefer-map-from-entries`. Two rules changed identity:
`no-array-for-each` was renamed to `no-for-each` and `no-hex-escape` was
dropped in favor of `prefer-unicode-code-point-escapes`. The v67
recommended preset also drops `no-unreadable-new-expression` and
`comment-content`. Consumers linting with `--max-warnings=0` may surface
new warnings and should expect to address them when adopting this release.
