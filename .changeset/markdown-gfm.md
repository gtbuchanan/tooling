---
'@gtbuchanan/eslint-config': minor
'@gtbuchanan/eslint-plugin-agent-skills': patch
---

Lint Markdown as GitHub Flavored Markdown

`configure()` parsed Markdown as CommonMark, which reads a table as a
paragraph, so nothing checked tables: markdownlint's MD056 was off in favor of
`markdown/table-column-count`, which `@eslint/markdown` v9 runs only on GFM. It
now parses GFM and warns on a table row whose cell count differs from its
header, which can surface new warnings in existing tables.

The Agent Skills configs parse skill files as GFM too. They override the
language of any earlier block for those files, so under CommonMark a GFM-only
rule enabled there made ESLint reject the config for every skill file.
