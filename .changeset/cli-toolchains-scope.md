---
'@gtbuchanan/cli': minor
---

Add a `toolchains` scope to `gtb verify`

It runs the rules each toolchain checks for itself. The check that a published
package depends on no private workspace package moves there from the
`manifest` scope, so `gtb verify manifest` no longer reports it; a full
`gtb verify` still does.
