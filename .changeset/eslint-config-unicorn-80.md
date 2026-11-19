---
'@gtbuchanan/eslint-config': minor
---

Lint with eslint-plugin-unicorn v80

Its recommended preset, which `configure()` enables for script files, gains
`unicorn/prefer-options-parameter`, `unicorn/prefer-regexp-exec` and
`unicorn/require-spread-parentheses`, and drops
`unicorn/no-async-promise-finally`. Expect new warnings where a function takes
more than one optional positional parameter, where `String#match` could be
`RegExp#exec`, and where a spread argument such as `...await x` or `...a ?? b`
lacks parentheses. `--fix` rewrites the `match` calls and the spreads; an
optional positional parameter needs a hand edit or a suppression.
