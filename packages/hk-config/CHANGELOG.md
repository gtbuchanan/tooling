# @gtbuchanan/hk-config

## 0.2.4

### Patch Changes

- 1574fba: Bump the hk package imports to v1.54.1

  `Defaults.pkl` imports `Config.pkl` and `Builtins.pkl` from a
  version-pinned hk release URL, so consumers of the preset resolve
  whichever hk the pin names. Move that pin to v1.54.1, matching the
  version `mise.toml` installs.

## 0.2.3

### Patch Changes

- 53b00a0: Bump the hk package imports to v1.54.0

  `Defaults.pkl` imports `Config.pkl` and `Builtins.pkl` from a
  version-pinned hk release URL, so consumers of the preset resolve
  whichever hk the pin names. Move that pin to v1.54.0, matching the
  version `mise.toml` installs.

## 0.2.2

### Patch Changes

- 88a62d6: Bump the bundled hk `Config`/`Builtins` import to 1.53.0

  The builtin schemas the preset builds on are unchanged, so no preset
  step needed reworking. The releases in this range fix hook behavior the
  preset depends on:

  - The `pre-commit` hook stashes via `patch-file`; hk no longer stashes
    at all when a hook has no steps to run.
  - The `no-commit-to-branch` guard now tolerates a detached HEAD instead
    of erroring.
  - A failed step no longer leaves its dependents blocked.

## 0.2.1

### Patch Changes

- 1029c5f: Bump the bundled hk `Config`/`Builtins` import to 1.51.0

  hk 1.51 reworked two builtin schemas the preset builds on:

  - Builtins now expose commands as structured argv (`Config.Command`)
    rather than shell strings. The actionlint step reads the builtin's
    command into a per-OS `Script` (string-only), so it joins the argv
    back into a string.
  - The `shellcheck`/`shfmt` builtins select files via `match_any`, whose
    `sh`/`bash` type clause over-matches non-shell files (markdown, JSON,
    YAML). The preset clears `match_any` and keeps selecting by the
    narrower `shell` content type, which hk 1.51 also requires (it rejects
    `match_any` combined with a top-level `types`).

## 0.2.0

### Minor Changes

- 02e25ff: Drop hk batching/diff workarounds fixed upstream in hk 1.47

  hk 1.47 made auto-batching respect the platform command-line limit
  (cmd.exe on Windows) and added a no-merge-base fallback for ref diffs,
  so the local workarounds are no longer needed:

  - `@gtbuchanan/hk-config`: drop the `batchFiles` primitive and the
    per-step `batch` wiring from `fileHygiene` — hk auto-batches under the
    arg limit on its own.
  - `@gtbuchanan/cli`: `gtb hk all` no longer sets `HK_BATCH`, and
    `gtb hk base` hands the range to hk as `--from-ref=<base> --to-ref=HEAD`
    instead of pre-computing the changed-file list.

- 1b63553: Expand the shared preset so consumers adopt it in ~one line instead of
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

## 0.1.0

### Minor Changes

- Initial release
