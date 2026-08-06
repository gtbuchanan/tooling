---
'@gtbuchanan/eslint-config': minor
---

Enable import-x hygiene rules alongside import ordering

`eslint-plugin-import-x` was wired for `order` only, so nothing caught a
module being imported twice in one file, a module importing itself, or an
`export let`. Ten low-cost rules now run alongside the ordering rule:
`first`, `newline-after-import`, `no-absolute-path`,
`no-anonymous-default-export`, `no-duplicates`, `no-empty-named-blocks`,
`no-mutable-exports`, `no-named-default`, `no-self-import`, and
`no-useless-path-segments`.

Each was measured against this workspace before being added and reports
nothing today, so adopting them is a no-op for code that already follows
the conventions. Several are auto-fixable via `--fix`. Consumers with
pre-existing violations will see new warnings, which `--max-warnings=0`
turns into a CI failure — hence the minor bump rather than a patch.

The resolution-based correctness rules (`no-unresolved`, `named`,
`default`, `namespace`, `export`) stay off: TypeScript already reports
every one of them, and they force full module resolution on each lint.
The graph-walking rules (`no-cycle`, `no-deprecated`, `no-unused-modules`)
stay off on cost. `no-commonjs` is excluded because a `.pnpmfile.cjs`
must be CommonJS, and `no-namespace` because `import * as build` is an
established convention.
