---
'@gtbuchanan/cli': patch
---

Order type-check, compile, lint, and unit-test tasks, including the root's lint and type-check, after their workspace dependencies' codegen (`^generate`), and order the unit-test tasks after their own package's codegen
