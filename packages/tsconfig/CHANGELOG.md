# @gtbuchanan/tsconfig

## 0.2.0

### Minor Changes

- f043fe5: Raise `lib` and `target` to ES2025 in `node.json` to match the Node 24
  engine floor, so lint rules that assume ES2025 APIs (e.g.
  `unicorn/prefer-set-methods` suggesting `Set#difference`) compile
  without suppressions, and declare the `typescript` peer range this
  requires (`>=6.0.0`, the first release accepting `es2025`)

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
