# @gtbuchanan/eslint-plugin-md-frontmatter

## 0.1.2

### Patch Changes

- eadd54f: Stop `md-frontmatter/schema` throwing on a schema that declares `$id`

  Ajv registers a schema under its `$id` process-wide and throws
  `schema with key or id "..." already exists` on a second registration.
  The rule guarded against that with a compile cache keyed on schema-object
  identity, but ESLint hands the rule a fresh options object every time a
  config is resolved, so the cache missed and Ajv saw the same id twice —
  one lint pass succeeded and the next died inside the rule.

  The rule's Ajv instance now sets `addUsedSchema: false`, so compiling a
  schema no longer registers it under its `$id`. The id still establishes
  the base URI, so a `$ref` written against it resolves as before.

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
