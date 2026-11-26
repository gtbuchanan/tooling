---
'@gtbuchanan/eslint-config': minor
---

Require fenced code blocks in Markdown

markdownlint's MD046 (`code-block-style`) now requires fenced blocks instead of
its default `consistent` style, which only compared a file's blocks against its
first and so let a file of indented blocks pass. Expect a new warning on every
indented code block. MD046 has no autofix, so convert each one to a fence by
hand; Prettier keeps either style, so it won't undo the conversion.
