# @gtbuchanan/eslint-plugin-agent-skills

## 0.3.0

### Minor Changes

- 61e9e23: Add `agent-skills/max-tokens`, capping the `SKILL.md` body at the Agent
  Skills spec's recommended instruction-tier token budget. Enabled in
  `configs.recommended` for `SKILL.md` at 5000 tokens.

### Patch Changes

- @gtbuchanan/eslint-plugin-md-frontmatter@0.1.3

## 0.2.1

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

- Updated dependencies [2c55ea0]
  - @gtbuchanan/eslint-plugin-md-frontmatter@0.1.3

## 0.2.0

### Minor Changes

- eadd54f: Add composable host extensions for `SKILL.md` frontmatter

  `skillFrontmatterSchema` closes frontmatter to unknown properties, per
  the Agent Skills spec, so a skill using a host's own field — say
  `user-invocable: false` on a building block that shouldn't reach Claude
  Code's `/` menu — had no lever short of replacing the schema wholesale,
  which drops the spec validation entirely.

  ```js
  export default [
    ...configs.recommended,
    ...defineSkillFrontmatterConfig("claude-code", myExtensions),
  ];
  ```

  A source is a host name from the new `skillFrontmatterHosts` registry
  (`claude-code` ships today) or a JSON Schema property map for a host
  this package doesn't. Pass every host a repo targets to one call —
  sources union, and a second overlay would replace the first rather than
  merge with it. `defineSkillFrontmatterSchema` returns the same schema
  for callers wiring the rule themselves.

  Only property definitions are layered on, and `configs.recommended` is
  unchanged, so repos targeting the bare standard keep the stricter
  validation.

- 1cf285a: Move `@eslint/json` and `@eslint/markdown` to peer dependencies

  `configs.recommended` registers both under the `json` and `markdown`
  plugin namespaces. ESLint rejects a namespace registered by two configs
  unless both pass the identical plugin object, so a consumer config that
  also registers `markdown` — `@gtbuchanan/eslint-config` does, for
  `**/*.md` — has to resolve to the same copy this plugin imports. As
  regular dependencies with exact pins, the two published manifests drift
  apart whenever only one package is re-released after a bump, pnpm
  installs two copies, and linting any `skills/*/SKILL.md` fails with
  `Cannot redefine plugin "markdown"` before a single rule runs.

  Consumers installing this plugin directly now need to install
  `@eslint/json` and `@eslint/markdown` alongside it.

### Patch Changes

- Updated dependencies [eadd54f]
  - @gtbuchanan/eslint-plugin-md-frontmatter@0.1.2

## 0.1.1

### Patch Changes

- d8f16ea: Ship README and LICENSE in published npm tarballs

  `pack:npm` now copies each package's `README.md` and the workspace-root
  `LICENSE` into `dist/source/` (the directory `publishConfig.directory`
  redirects publishing to), and the published `package.json` carries a
  `license` field. A package-level `README`/`LICENSE`/`license` overrides the
  shared root one. Re-publishes every package so the first release's missing
  docs are corrected.

- Updated dependencies [d8f16ea]
  - @gtbuchanan/eslint-plugin-md-frontmatter@0.1.1

## 0.1.0

### Minor Changes

- Initial release
