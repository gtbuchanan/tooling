# @gtbuchanan/hk-config

Shared [hk](https://hk.jdx.dev) pre-commit preset, distributed as a
[Pkl](https://pkl-lang.org) package. Provides reusable building blocks —
file-hygiene steps, a submodule guard, and a Renovate config validator — so
consumer `hk.pkl` files compose them instead of redefining each step.

This is a Pkl package published to GitHub releases (not npm), imported via a
`package://` URL with sha256 integrity.

## Usage

Import the preset in your `hk.pkl` and spread its building blocks into your
hooks:

```pkl
amends "package://github.com/jdx/hk/releases/download/v1.46.0/hk@1.46.0#/Config.pkl"
import "package://github.com/jdx/hk/releases/download/v1.46.0/hk@1.46.0#/Builtins.pkl"
import "package://github.com/gtbuchanan/tooling/releases/download/hk-config@0.1.0/hk-config@0.1.0#/Defaults.pkl"

hooks {
  ["pre-commit"] {
    fix = true
    steps {
      ...Defaults.fileHygiene
      ["forbid-submodules"] = Defaults.forbidSubmodules
      ["renovate-config"] = Defaults.renovateConfig
    }
  }
}
```

The `renovateConfig` step shells out to `renovate-config-validator`, which ships
only inside the `renovate` npm package — add `npm:renovate` to your mise
`[tools]` so hk can resolve it on `PATH`.

## Building Blocks

- `fileHygiene` — large-file, end-of-file-newline, byte-order-marker, and
  trailing-whitespace fixers, each pre-wired with the default exclude.
- `forbidSubmodules` — a per-OS gitlink (submodule) guard.
- `jactionlint` — lints workflows, composite actions and Dependabot config at
  the `correctness` profile. `jactionlintWith(profile)` builds the same step at
  `default` or `pedantic`, whose autofixes rewrite workflows during pre-commit:
  `["jactionlint"] = Defaults.jactionlintWith("pedantic")` after spreading
  `recommended`.
- `renovateConfig` — validates `.github/renovate.json` via
  `renovate-config-validator`. Amend its `glob` to target a different file
  (e.g. `default.json` for preset-authoring repos).
- `gtbCliSteps(prefix)` — `gtb verify`, fixed by `gtb sync`, so a commit that
  drifts from the generated config is repaired and re-staged. The argument
  sets how `gtb` resolves: `null` for a mise `npm:@gtbuchanan/cli` tool,
  `"pnpm exec"` for a workspace devDependency. Not in `recommended`, since it
  fails wherever gtb isn't installed.
- `defaultExclude` — the default exclude regex (lockfiles plus a root
  `vendor/`), exposed so you can wire the same exclude onto your own tool
  steps.
- `lockfileExclude` / `vendorExclude` — the individual exclude regexes that
  compose `defaultExclude`, for steps that need only one.
