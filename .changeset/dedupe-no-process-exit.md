---
'@gtbuchanan/eslint-config': patch
---

Dedupe overlapping `no-process-exit` rules. `unicorn/no-process-exit` is
now the canonical rule (its message is CLI-aware) and `n/no-process-exit`
is disabled globally. The entry-point exemption moves to the unicorn rule,
so `process.exit()` in entry points is fully exempt instead of only
partially.
