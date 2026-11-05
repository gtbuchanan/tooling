---
'@gtbuchanan/eslint-config': minor
---

Update `eslint-plugin-unicorn` to v79

Its recommended preset enables more rules, among them
`prefer-combined-guards`, `prefer-ternary`, `prefer-early-return`,
`no-unnecessary-parameters`, and a `consistent-boolean-name` that also checks
functions returning a boolean, so expect new warnings.

`no-asterisk-prefix-in-documentation-comments` is off, since it strips the
gutter `jsdoc/require-asterisk-prefix` requires, and `consistent-boolean-name`
ignores `mock`-named test doubles.
