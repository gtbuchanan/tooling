---
'@gtbuchanan/cli': patch
---

Stop taking a directory for a config file, or a file for a directory

A directory named like `tsconfig.json`, `eslint.config.*`, `vitest.config.*`
or a `.pkl` file no longer turns on that toolchain, and a file named `skills`
or `test` no longer counts as that directory. Each used to put the package in
the plan and leave `gtb sync` writing config the package couldn't use.
