# @gtbuchanan/eslint-config

## 0.5.2

### Patch Changes

- Updated dependencies [79c96d0]
  - @gtbuchanan/eslint-plugin-agent-skills@1.0.0

## 0.5.1

### Patch Changes

- Updated dependencies [61e9e23]
  - @gtbuchanan/eslint-plugin-agent-skills@0.3.0
  - @gtbuchanan/eslint-plugin-markdownlint@0.1.2
  - @gtbuchanan/eslint-plugin-md-frontmatter@0.1.3
  - @gtbuchanan/eslint-plugin-yamllint@0.1.2

## 0.5.0

### Minor Changes

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

- 5d8c23d: Start the import-x config from its recommended preset

  `eslint-plugin-import-x` was configured rule-by-rule rather than from its
  recommended preset, so only `order` was enabled and upstream additions
  never arrived on upgrade. It now spreads `flatConfigs.recommended` plus
  the plugin's own `flatConfigs.typescript`, matching every other plugin
  here, which brings in `no-duplicates`.

  Seven rules are added on top — `first`, `newline-after-import`,
  `no-absolute-path`, `no-empty-named-blocks`, `no-mutable-exports`,
  `no-self-import`, and `no-useless-path-segments` — several autofixable.

  Six preset rules are switched back off. `default`, `export`, `namespace`,
  and `no-unresolved` duplicate what TypeScript already reports and force
  full module resolution on every lint. `no-named-as-default` and
  `no-named-as-default-member` flag the `import plugin from 'x'` then
  `plugin.configs` idiom that ESLint plugins are consumed with.

  Consumers with pre-existing violations will see new warnings, which
  `--max-warnings=0` turns into a CI failure.

- 1151b04: Enable `import-x/no-extraneous-dependencies`

  Importing a package the manifest does not declare resolves only through
  layout: Node walks up to a parent `node_modules` and finds it there. That
  works until the package moves, and it leaves any version range the
  dependency declares unenforced for the importing package.

  The rule reports imports missing from the importing package's own
  manifest. Consumers that rely on a parent manifest to satisfy imports will
  see new warnings, which `--max-warnings=0` turns into a CI failure — hence
  the minor bump. Declaring the dependency in the package that imports it is
  the fix; `catalog:` keeps the version in one place for pnpm workspaces.

### Patch Changes

- fd45a22: Drop the now-unnecessary cast on the TSDoc flat config

  eslint-plugin-jsdoc used to type its flat configs as arrays while
  `recommended-tsdoc` was a single object at runtime, so reading it
  required an `as unknown as Linter.Config` double cast. Upstream has
  since corrected the types, making the cast a no-op that
  `@typescript-eslint/no-unnecessary-type-assertion` now reports. Remove
  the cast along with the stale comment explaining it.

- Updated dependencies [2c55ea0]
  - @gtbuchanan/eslint-plugin-agent-skills@0.2.1
  - @gtbuchanan/eslint-plugin-markdownlint@0.1.2
  - @gtbuchanan/eslint-plugin-md-frontmatter@0.1.3
  - @gtbuchanan/eslint-plugin-yamllint@0.1.2

## 0.4.0

### Minor Changes

- 44daadb: Derive lint ignores from `.gitignore`

  `configure()` now reads `.gitignore` through `eslint-config-flat-gitignore` and contributes the converted patterns as a global-ignores entry, so untracked paths — build output, caches, generated files — are never linted without being enumerated. Nested `.gitignore` files are discovered too, and a repo without one contributes no patterns instead of throwing.

  The new `gitignore` option takes `false` to opt out, or a `FlatGitignoreOptions` object merged over `defaultGitignoreOptions`.

  Because `.gitignore` now covers generated paths, the default `ignores` list was narrowed to the **tracked** files another tool owns the format of: lockfiles — matched by naming convention rather than per package manager — and `CHANGELOG.md`. That list is exported as `defaultIgnores` so it can be spread when overriding, since `ignores` replaces its default wholesale.

  Repos that pass `gitignore: false` and relied on the previous defaults to skip build output now have to list those paths themselves.

### Patch Changes

- 6d9965d: Disable markdownlint MD060 (`table-column-style`), which conflicts with Prettier

  Prettier (via `eslint-plugin-format`) already owns Markdown table formatting and aligns pipe columns. markdownlint's `table-column-style` (MD060) ships its own autofixer that rewrites tables to compact pipes, so the two fixers oscillate — ESLint applies one, the other reverts it, and once the fix-pass limit is reached the run bails with a half-formatted table and unresolvable warnings (fatal under `--max-warnings=0`). MD060 now joins the other `prettierConflicts` rules disabled in the markdownlint config, leaving table formatting to Prettier.

## 0.3.0

### Minor Changes

- eadd54f: Add an `agentSkillsHost` option for `SKILL.md` frontmatter extensions

  `SKILL.md` frontmatter is validated against the Agent Skills spec, which
  rejects the fields agent hosts document on top of the standard.
  `agentSkillsHost` names the hosts to accept — a host name, a JSON Schema
  property map for a host the plugin doesn't ship, or a list of either for
  skills targeting several at once:

  ```js
  configure({ agentSkillsHost: ["claude-code", myExtensions] });
  ```

  Listed hosts union their fields. The default, `'standard'`, keeps
  validating against the bare spec — which is also the "valid under every
  host" setting — so existing configs are unaffected.

- 4e1ef43: Allow `require()` in `.cjs` files

  The `.cjs` extension forces CommonJS, so `require()` is the only way to
  import — `import` is a syntax error there. Every consumer with a `.cjs`
  file (a script stub, `.pnpmfile.cjs`, etc.) had to turn
  `@typescript-eslint/no-require-imports` off itself.

  Also exports the `cjsFiles` glob so consumers can scope their own `.cjs`
  overrides to the same pattern.

- d79ceea: Ignore generated `CHANGELOG.md` files by default

  Changesets writes `CHANGELOG.md` through its own Prettier resolution,
  which cannot see the options this config hands `format/prettier`. A
  changeset whose body contains a fenced code block comes back reformatted
  — stock Prettier double-quotes string literals where this config's
  `singleQuote` does not — and the diff is unfixable at the source, since
  the `.changeset/*.md` the snippet was authored in is linted the other
  way. Every version PR failed lint on a file no one can correct.

  The generated changelog joins build output, lockfiles, and generated
  skills in the default `ignores`: paths another tool generates and owns
  the format of. Authored `.changeset/*.md` are unaffected and stay
  linted.

  Repos passing their own `ignores` replace the default list wholesale, so
  add `**/CHANGELOG.md` to keep this behavior.

- 462dc45: Enforce a pnpm workspace settings policy

  `eslint-plugin-pnpm`'s `yaml-enforce-settings` is the only rule it ships
  that lints the settings keys of `pnpm-workspace.yaml` — the block that
  absorbed most of `.npmrc` in pnpm 10. No config enables it, because it
  carries no default policy and throws unless given one. The remaining
  rules cover only catalogs and package globs, so nothing kept install
  behavior consistent across repos.

  `configure()` now supplies a policy by default, exported as
  `defaultPnpmWorkspaceSettings`: `engineStrict`, `hoist`,
  `minimumReleaseAge`, and `strictPeerDependencies` are matched by value
  and auto-fixed into place; `minimumReleaseAgeExclude` is required to
  exist without pinning its contents; and `dangerouslyAllowAllBuilds`,
  `publicHoistPattern`, `shamefullyHoist`, and `trustLockfile` are
  forbidden outright.

  The split between the three knobs is deliberate. `settings` compares
  whole values and its fixer replaces the entire key/value pair, so
  pinning a list a consumer extends would make `--fix` delete their added
  scopes — hence the exclude list is required rather than value-matched.
  `settings` also cannot express "anything but this value", so a setting
  that is unsafe in one direction has to be banned by key instead.

  Repos whose `pnpm-workspace.yaml` omits these settings will see new
  warnings that `--fix` resolves. Pass a replacement policy to
  `pnpmWorkspaceSettings` to change it, or `false` to keep the catalog
  rules without the settings policy.

### Patch Changes

- c97db0a: Publish runtime dependencies as caret ranges instead of exact pins

  The `catalog:` entries backing these packages' runtime dependencies were
  exact pins, and pnpm substitutes the catalog spec verbatim at publish
  time — so consumers received hard pins that force a duplicate install
  whenever they resolve a different version of the same package. Exact
  pins remain only on root devDependencies, which are never published.

- b70d1fb: Stop `--fix` corrupting JSON files with unsorted keys

  `json/sort-keys` and `format/prettier` were both fixable on the same
  files. ESLint saw their fix ranges as non-overlapping and applied both
  in one pass, interleaving the reordered keys with a Prettier text diff
  computed against the unsorted original — the file came out as invalid
  JSON that no later pass could recover. Prettier already sorts these
  files recursively via `prettier-plugin-sort-json`, so `json/sort-keys`
  is now off and Prettier owns JSON key order outright.

- Updated dependencies [eadd54f]
- Updated dependencies [1cf285a]
- Updated dependencies [eadd54f]
  - @gtbuchanan/eslint-plugin-agent-skills@0.2.0
  - @gtbuchanan/eslint-plugin-md-frontmatter@0.1.2
  - @gtbuchanan/eslint-plugin-markdownlint@0.1.1
  - @gtbuchanan/eslint-plugin-yamllint@0.1.1

## 0.2.1

### Patch Changes

- fe079b6: Dedupe overlapping `no-process-exit` rules. `unicorn/no-process-exit` is
  now the canonical rule (its message is CLI-aware) and `n/no-process-exit`
  is disabled globally. The entry-point exemption moves to the unicorn rule,
  so `process.exit()` in entry points is fully exempt instead of only
  partially.

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
