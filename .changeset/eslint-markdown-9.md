---
'@gtbuchanan/eslint-config': patch
'@gtbuchanan/eslint-plugin-agent-skills': patch
---

Lint Markdown with `@eslint/markdown` v9

`configure()` enables the same rules as before. v9 fixes several false
positives, among them `markdown/no-missing-link-fragments` on fragments that
target an HTML anchor. `eslint-plugin-agent-skills` accepts v9 as its peer
alongside v8.
