---
'@gtbuchanan/cli': patch
---

Settle `gtb sync` in one run for a single-package TypeScript root

The root tsconfig `gtb sync` writes gives a single-package root the typescript
capability, and the root's scripts and turbo tasks used to catch up only on a
second sync.

Toolchains now plan their workspace checks as findings that `gtb sync` applies
and `gtb verify` reports, so a toolchain can own the files it generates.
