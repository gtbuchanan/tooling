---
'@gtbuchanan/cli': patch
'@gtbuchanan/eslint-config': patch
'@gtbuchanan/eslint-plugin-agent-skills': patch
'@gtbuchanan/eslint-plugin-markdownlint': patch
'@gtbuchanan/eslint-plugin-md-frontmatter': patch
'@gtbuchanan/eslint-plugin-yamllint': patch
'@gtbuchanan/pnpm-termux-shim': patch
'@gtbuchanan/tsconfig': patch
'@gtbuchanan/vitest-config': patch
---

Ship README and LICENSE in published npm tarballs

`pack:npm` now copies each package's `README.md` and the workspace-root
`LICENSE` into `dist/source/` (the directory `publishConfig.directory`
redirects publishing to), and the published `package.json` carries a
`license` field. A package-level `README`/`LICENSE`/`license` overrides the
shared root one. Re-publishes every package so the first release's missing
docs are corrected.
