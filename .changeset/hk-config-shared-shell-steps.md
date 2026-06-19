---
'@gtbuchanan/hk-config': minor
---

Expand the shared preset so consumers adopt it in ~one line instead of
re-declaring every step and hook.

- Add `actionlint` (carries the Windows shellcheck-deadlock workaround
  previously inline in the self-host `hk.pkl`), `shellcheck`, and `shfmt`
  steps. `shellcheck` / `shfmt` select shell sources by content type
  (extension and shebang, matching extensionless scripts) with
  `defaultExclude` pre-wired.
- Add the `shell` group (`shellcheck` + `shfmt`) and the `recommended`
  step mapping (file hygiene + `forbid-submodules` + `renovate-config` +
  `actionlint` + shell) for one-line adoption; every step is glob/type-gated,
  so inapplicable steps are inert.
- Add `hooksFor(steps)`, building the standard `pre-commit` / `check` /
  `fix` hook trio (pre-commit stashes via `patch-file` and adds the
  commit-time-only `no-commit-to-branch` guard).
