---
'@gtbuchanan/hk-config': patch
---

Bump the bundled hk `Config`/`Builtins` import to 1.53.0

The builtin schemas the preset builds on are unchanged, so no preset
step needed reworking. The releases in this range fix hook behavior the
preset depends on:

- The `pre-commit` hook stashes via `patch-file`; hk no longer stashes
  at all when a hook has no steps to run.
- The `no-commit-to-branch` guard now tolerates a detached HEAD instead
  of erroring.
- A failed step no longer leaves its dependents blocked.
