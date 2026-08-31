# @gtbuchanan/vitest-config

## 0.2.0

### Minor Changes

- 59b6616: Add a `testTimeout` option to `configure`, `configurePackage`, and
  `configureGlobal`

  Raise it for a package whose tests do seconds of real work — building an
  ESLint config, starting a TypeScript project service, spawning a child
  process. On a machine running the rest of the build in parallel, that
  work exceeds vitest's 5s default and the suite fails under load while
  passing in isolation.

  The trade is real: this is a duration bound, so a higher one catches a
  performance regression later. It buys reliability, because a wall-clock
  limit can't distinguish a slower test from a busier machine. Size it to
  the worst contention the suite runs under, not to the test's own cost.

  `testTimeout` was already accepted by the e2e entry points; this makes
  it consistent for source tests.

  Fixes `testTimeout: 0` on the e2e entry points, where vitest's
  documented way to disable the limit was dropped by a truthiness check
  and silently fell back to the default. `hookTimeout` derives from it
  there, so both were affected.

## 0.1.3

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

## 0.1.2

### Patch Changes

- c97db0a: Publish runtime dependencies as caret ranges instead of exact pins

  The `catalog:` entries backing these packages' runtime dependencies were
  exact pins, and pnpm substitutes the catalog spec verbatim at publish
  time — so consumers received hard pins that force a duplicate install
  whenever they resolve a different version of the same package. Exact
  pins remain only on root devDependencies, which are never published.

## 0.1.1

### Patch Changes

- d8f16ea: Ship README and LICENSE in published npm tarballs

  `pack:npm` now copies each package's `README.md` and the workspace-root
  `LICENSE` into `dist/source/` (the directory `publishConfig.directory`
  redirects publishing to), and the published `package.json` carries a
  `license` field. A package-level `README`/`LICENSE`/`license` overrides the
  shared root one. Re-publishes every package so the first release's missing
  docs are corrected.

## 0.1.0

### Minor Changes

- Initial release
