---
'@gtbuchanan/eslint-config': minor
---

Adopt the import-x recommended preset and add import hygiene rules

`eslint-plugin-import-x` was the one plugin configured from scratch rather
than from its `recommended` preset, and it enabled only `order`. Nothing
caught a module being imported twice in one file, a module importing
itself, or an `export let`.

It now follows the same shape as every other plugin here: start from
`flatConfigs.recommended`, layer the plugin's own `flatConfigs.typescript`
on top, then override. That brings in `no-duplicates` and means future
additions to the preset arrive on upgrade instead of being missed.

Six rules from the preset are switched back off. `default`, `export`,
`namespace`, and `no-unresolved` are all reported by TypeScript already,
and leaving them on makes each lint resolve the full module graph
(`named` is already off via the typescript config). `no-named-as-default`
and `no-named-as-default-member` are off because they flag the standard
`import plugin from 'x'` then `plugin.configs` idiom used to consume
ESLint plugins, and their cross-module parsing emits spurious "Parse
errors in imported module" warnings against sibling workspace packages.

Seven hygiene rules are added on top: `first`, `newline-after-import`,
`no-absolute-path`, `no-empty-named-blocks`, `no-mutable-exports`,
`no-self-import`, and `no-useless-path-segments`.

`no-anonymous-default-export` and `no-named-default` are deliberately left
out even though they fit: unicorn's recommended preset already enables its
own versions of both, and adding these would double-report every
violation.

Every enabled rule was measured against this workspace and reports nothing
today, so adoption is a no-op for code already following the conventions.
Several are auto-fixable via `--fix`. Consumers with pre-existing
violations will see new warnings, which `--max-warnings=0` turns into a CI
failure — hence the minor bump rather than a patch.

Still excluded: the graph-walking rules (`no-cycle`, `no-deprecated`,
`no-unused-modules`) on cost, `no-commonjs` because a `.pnpmfile.cjs` must
be CommonJS, and `no-namespace` because `import * as build` is an
established convention.
