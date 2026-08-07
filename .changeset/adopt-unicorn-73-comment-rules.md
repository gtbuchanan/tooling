---
'@gtbuchanan/cli': patch
'@gtbuchanan/eslint-config': minor
'@gtbuchanan/eslint-plugin-agent-skills': patch
'@gtbuchanan/eslint-plugin-markdownlint': patch
'@gtbuchanan/eslint-plugin-md-frontmatter': patch
'@gtbuchanan/eslint-plugin-yamllint': patch
'@gtbuchanan/libsql-termux-shim': patch
'@gtbuchanan/pnpm-termux-shim': patch
'@gtbuchanan/vitest-config': patch
---

Pair jsdoc/require-asterisk-prefix with unicorn's block comment rule

eslint-plugin-unicorn v73 adds `single-line-block-comment-style`, which
expands one-line block comments to multiline. It deliberately stops
short of the asterisk gutter, leaving JSDoc internals to
eslint-plugin-jsdoc — see
https://github.com/sindresorhus/eslint-plugin-unicorn/issues/3603.
Enabling `jsdoc/require-asterisk-prefix` completes the pair, so `--fix`
lands on standard gutter JSDoc. Plain block comments keep no gutter,
mirroring the doc-vs-incidental split that `///` and `//` draw in C#.

v73 also adds `consistent-boolean-name`. `try` joins the allowed
prefixes: it marks an action that reports whether it succeeded, the
established Try* idiom, which none of the default prefixes express.
