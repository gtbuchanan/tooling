# @gtbuchanan/pnpm-termux-shim

## 0.1.3

### Patch Changes

- 6dd5fce: Run pnpm 11 and later, whose entry point is `bin/pnpm.mjs`

  The shim ran `bin/pnpm.cjs`, which pnpm 11 removed, so every `pnpm` call
  through it failed with `Cannot find module`. It now runs `bin/pnpm.mjs` and
  falls back to `bin/pnpm.cjs` for pnpm 10 and earlier.
- 9f5d4b6: Run the npm turbo on Termux instead of `pkg install turbo`

  turbo 2.10.8 publishes its `linux-arm64` binary under `os: ["android",
  "linux"]`, so `node_modules/.bin/turbo` starts on Android and `gtb turbo` no
  longer looks for the Termux-packaged turbo at `$PREFIX/bin/turbo`. That package
  lags upstream and rejects keys `gtb sync` writes into `turbo.json`. The turbo
  peer range rises to `>=2.10.8` to match, and `pkg install turbo` is no longer
  needed.

  On Android, `gtb turbo` also puts `@gtbuchanan/pnpm-termux-shim`'s `pnpm` first
  on turbo's PATH. The CLI takes the shim as an optional dependency, so remove it
  from your workspace root's `optionalDependencies` unless something other than
  `gtb turbo` runs turbo.

  `gtb turbo` now makes every PATH entry absolute before running turbo, so turbo
  finds a root-declared shim from each package directory under pnpm 11 and
  earlier. See the shim's README for the setup.

## 0.1.2

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
