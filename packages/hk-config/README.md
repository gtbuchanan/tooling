# @gtbuchanan/hk-config

Shared [hk](https://hk.jdx.dev) pre-commit preset, distributed as a
[Pkl](https://pkl-lang.org) package. Provides reusable building blocks —
file-hygiene steps, a submodule guard, and a Renovate config validator — so
consumer `hk.pkl` files compose them instead of redefining each step.

This is a Pkl package published to GitHub releases (not npm), imported via a
`package://` URL with sha256 integrity.

## Usage

Import `Defaults.pkl`, spread `recommended` into a step mapping alongside your
repository's own steps, and build the hooks with `hooksFor`:

```pkl
amends "package://github.com/jdx/hk/releases/download/v<hk-version>/hk@<hk-version>#/Config.pkl"

import "package://github.com/gtbuchanan/tooling/releases/download/hk-config@<version>/hk-config@<version>#/Defaults.pkl"

local allSteps = new Mapping<String, Step> {
  ...Defaults.recommended
  ...Defaults.nodeSteps("pnpm exec") // drop if the repository has no ESLint
}

hooks = Defaults.hooksFor(allSteps)
```

The `renovate-config` step shells out to `renovate-config-validator`, which
ships only inside the `renovate` npm package — add `npm:renovate` to your mise
`[tools]` so hk can resolve it on `PATH`.

To amend or reuse a single step, import the module that holds it from the same
package URL, swapping `Defaults.pkl` for the module's file:

```pkl
import "package://github.com/gtbuchanan/tooling/releases/download/hk-config@<version>/hk-config@<version>#/Workflows.pkl"

local allSteps = new Mapping<String, Step> {
  ...(Defaults.recommended) {
    ["jactionlint"] = Workflows.jactionlintWith("pedantic")
  }
}
```

## Preset Modules

`Defaults.pkl` holds the compositions. Every step lives in exactly one module,
and no module re-exports another's:

| Module          | Holds                                                                        |
| :-------------- | :--------------------------------------------------------------------------- |
| `Defaults.pkl`  | `recommended`, `nodeSteps(prefix)`, `gtbCliSteps(prefix)`, `hooksFor(steps)` |
| `Eslint.pkl`    | `eslint`, `eslintArgs`                                                       |
| `Exclude.pkl`   | `defaultExclude`, `lockfileExclude`, `vendorExclude`                         |
| `GtbCli.pkl`    | `verify`                                                                     |
| `HkPackage.pkl` | the hk package's types and `builtins`                                        |
| `Hygiene.pkl`   | `fileHygiene`, `forbidSubmodules`                                            |
| `Renovate.pkl`  | `renovateConfig`                                                             |
| `Shell.pkl`     | `shellcheck`, `shfmt`, `shell`                                               |
| `Workflows.pkl` | `jactionlint`, `jactionlintWith(profile)`                                    |

- `recommended` — file hygiene, `forbid-submodules`, `renovate-config`,
  `jactionlint` and the shell pair. Every step is glob- or type-gated, so the
  ones a repository doesn't need never run.
- `hooksFor(steps)` — the `pre-commit` / `check` / `fix` hooks over `steps`.
  `pre-commit` runs in fix mode, stashes unstaged changes, and adds the
  `no-commit-to-branch` guard.
- `nodeSteps(prefix)` — ESLint over every changed file at zero warnings, reading
  the repository's own flat config. The argument sets how `eslint` resolves:
  `"pnpm exec"` for a workspace devDependency, `null` for PATH. Not in
  `recommended`, since it fails wherever ESLint isn't installed. Needs ESLint 10.
- `gtbCliSteps(prefix)` — `gtb verify`, fixed by `gtb sync`, so a commit that
  drifts from the generated config is repaired and re-staged. The argument
  sets how `gtb` resolves: `null` for a mise `npm:@gtbuchanan/cli` tool,
  `"pnpm exec"` for a workspace devDependency. Not in `recommended`, since it
  fails wherever gtb isn't installed.
- `jactionlintWith(profile)` — jactionlint at `default` or `pedantic` rather
  than the `correctness` profile `recommended` uses. The stricter profiles'
  autofixes rewrite workflows during pre-commit.
- `renovateConfig` — validates `.github/renovate.json`. Amend its `glob` to
  target a different file (e.g. `default.json` for preset-authoring repos).
- `defaultExclude` — lockfiles plus a root `vendor/`, for wiring the preset's
  exclude onto your own steps.
