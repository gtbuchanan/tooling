---
'@gtbuchanan/libsql-termux-shim': minor
---

Add `@gtbuchanan/libsql-termux-shim`, a stand-in for libsql's native binding
implemented on `node:sqlite`. libsql publishes no `@libsql/android-arm64`, so
dependents such as promptfoo fail at startup on Termux; aliasing the missing
target to this package lets them run. Local databases only — embedded replicas
throw.
