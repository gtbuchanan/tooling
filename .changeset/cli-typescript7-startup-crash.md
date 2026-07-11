---
'@gtbuchanan/cli': patch
---

Fix `gtb` crashing on startup when TypeScript 7 is the resolved compiler

`tsconfig-gen` resolved a package's build `include` through the classic
`typescript` compiler API (`ts.sys`, `ts.readConfigFile`,
`ts.parseJsonConfigFileContent`). TypeScript 7 restructured its npm package so
those are no longer exposed from the main entry, leaving `ts.sys` undefined and
crashing every `gtb` command at module load. The build `include` is now read
with `get-tsconfig`, which mirrors tsc's `extends` resolution — relative paths
and node_modules package specifiers alike — without depending on the
`typescript` package. `typescript` remains a peer dependency for the
`tsc`-backed `compile:ts` / `typecheck:ts` tasks.
