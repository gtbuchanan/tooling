---
'@gtbuchanan/hk-config': minor
---

Move each preset step into a module of its own

Breaking: `Defaults.pkl` now holds only `recommended`, `gtbCliSteps` and
`hooksFor`. Every step and exclude pattern moved to a module named for its tool,
so a reference to one through `Defaults` no longer resolves. Import the module
from the same package URL and reference the member through it:

- `defaultExclude`, `lockfileExclude`, `vendorExclude` → `Exclude.pkl`
- `fileHygiene`, `forbidSubmodules` → `Hygiene.pkl`
- `jactionlint`, `jactionlintWith`, `JactionlintProfile` → `Workflows.pkl`
- `renovateConfig` → `Renovate.pkl`
- `shellcheck`, `shfmt`, `shell` → `Shell.pkl`

A repository that uses only `recommended`, `gtbCliSteps` and `hooksFor` needs no
change.
