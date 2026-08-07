---
'@gtbuchanan/eslint-config': minor
---

Start the import-x config from its recommended preset

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
