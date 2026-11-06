---
'@gtbuchanan/cli': patch
---

Toolchains now plan their workspace checks as findings that `gtb sync` can apply and `gtb verify` reports, so a toolchain can own the files it generates.

`gtb sync` now settles in one run where the root tsconfig it writes gives a single-package root the typescript capability. Previously, the root's scripts and turbo tasks only caught up on a second sync.
