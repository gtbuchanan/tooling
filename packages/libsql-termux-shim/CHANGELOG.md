# @gtbuchanan/libsql-termux-shim

## 0.1.1

### Patch Changes

- 2c55ea0: Pair jsdoc/require-asterisk-prefix with unicorn's block comment rule

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

## 0.1.0

### Minor Changes

- feae032: Add `@gtbuchanan/libsql-termux-shim`, a stand-in for libsql's native binding
  implemented on `node:sqlite`. libsql publishes no `@libsql/android-arm64`, so
  dependents such as promptfoo fail at startup on Termux; aliasing the missing
  target to this package lets them run. Local databases only — embedded replicas
  throw.
