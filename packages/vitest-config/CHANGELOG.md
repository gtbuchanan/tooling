# @gtbuchanan/vitest-config

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
