# @gtbuchanan/eslint-config

## 0.2.0

### Minor Changes

- 55499aa: Update bundled `eslint-plugin-unicorn` to v68

  The recommended preset gains many new rules across v66, v67, and v68,
  crossing 300 rules. Several rules changed identity: `no-array-for-each`
  was renamed to `no-for-each`, `no-hex-escape` was dropped in favor of
  `prefer-unicode-code-point-escapes`, and `prevent-abbreviations` was
  renamed to `name-replacements` (kept disabled pending a future allowlist).
  The new `no-nonstandard-builtin-properties` rule is disabled because it
  flags the standard `Symbol.dispose`/`Symbol.asyncDispose` (Explicit
  Resource Management) without an allowlist option to permit them. Consumers
  linting with `--max-warnings=0` may surface new warnings and should expect
  to address them when adopting this release.

### Patch Changes

- c92b345: Scope CHANGELOG duplicate-heading lint to siblings only

  `markdown/no-duplicate-headings` now uses `checkSiblingsOnly` for
  `**/CHANGELOG.md`, so the `### Minor Changes` / `### Patch Changes`
  sections that changesets repeats across version headings no longer trip
  the rule (it still flags genuine duplicate siblings within one section).
  Authored Markdown keeps full duplicate-heading enforcement.

- d8f16ea: Ship README and LICENSE in published npm tarballs

  `pack:npm` now copies each package's `README.md` and the workspace-root
  `LICENSE` into `dist/source/` (the directory `publishConfig.directory`
  redirects publishing to), and the published `package.json` carries a
  `license` field. A package-level `README`/`LICENSE`/`license` overrides the
  shared root one. Re-publishes every package so the first release's missing
  docs are corrected.

- Updated dependencies [d8f16ea]
  - @gtbuchanan/eslint-plugin-agent-skills@0.1.1
  - @gtbuchanan/eslint-plugin-markdownlint@0.1.1
  - @gtbuchanan/eslint-plugin-md-frontmatter@0.1.1
  - @gtbuchanan/eslint-plugin-yamllint@0.1.1

## 0.1.0

### Minor Changes

- Initial release
