# @gtbuchanan/hk-config

## 0.4.0

### Minor Changes

- 91f9b71: Bump the hk package imports to v1.58.1

  `Defaults.pkl` imports `Config.pkl` and `Builtins.pkl` from a
  version-pinned hk release URL, so consumers of the preset resolve
  whichever hk the pin names. Move that pin to v1.58.1, matching the
  version `mise.toml` installs.

  Every step in the preset evaluates against the new schema unchanged, so
  a consumer that tracks the pin needs no edit of its own.

  hk 1.58.1 is the first release mise installs through the `packslip`
  backend rather than `aqua` (`registry/hk.toml` declares
  `min_version = "1.58.1"` on that backend), which rewrites the `hk`
  entry in a consumer's `mise.lock`: each platform gains a `signer` field
  naming hk's release workflow and loses `url_api`. Regenerate the entry
  with `mise lock hk` under mise 2026.9.5 or newer. Earlier mise resolves
  no platforms for 1.58.1 and leaves the old entry in place, which then
  fails every `MISE_LOCKED=1` install.

## 0.3.0

### Minor Changes

- e8b2968: Bump the hk package imports to v1.55.0 and port the actionlint step

  `Defaults.pkl` imports `Config.pkl` and `Builtins.pkl` from a
  version-pinned hk release URL, so consumers of the preset resolve
  whichever hk the pin names. Move that pin to v1.55.0, matching the
  version `mise.toml` installs.

  hk 1.55.0 wraps builtin commands in a `CommandSpec` (a command paired
  with its declared `effect`), so `Builtins.actionlint.check` is no
  longer a bare `Command` and reading `.argv` off it fails evaluation.
  The Windows shellcheck-deadlock workaround now reaches through
  `CommandSpec.command` for the builtin's argv, and amends the builtin's
  spec rather than replacing it, so the declared `effect` keeps tracking
  upstream.

  This is the preset's first release that requires hk 1.55.0 — the
  actionlint step is written against the new schema and will not evaluate
  against an earlier hk.

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
