---
'@gtbuchanan/eslint-plugin-agent-skills': minor
---

Move `@eslint/json` and `@eslint/markdown` to peer dependencies

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
