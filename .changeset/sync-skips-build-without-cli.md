---
'@gtbuchanan/cli': patch
---

`gtb sync` and `gtb verify` skip `turbo.json`, `package.json` scripts and tsconfigs when the workspace root doesn't depend on `@gtbuchanan/cli`. A repo that adopts only the hk preset and runs gtb from mise can now run plain `gtb sync` without getting build config it doesn't use.
