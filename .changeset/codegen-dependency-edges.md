---
'@gtbuchanan/cli': patch
---

Order the check and build tasks after their dependencies' codegen

Type-check, compile, lint and test tasks now depend on `^generate`, the root's
lint and type-check included, and test tasks also depend on their own
package's `generate`.
