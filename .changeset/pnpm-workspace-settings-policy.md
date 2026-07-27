---
'@gtbuchanan/eslint-config': minor
---

Enforce a pnpm workspace settings policy

`eslint-plugin-pnpm`'s `yaml-enforce-settings` is the only rule it ships
that lints the settings keys of `pnpm-workspace.yaml` — the block that
absorbed most of `.npmrc` in pnpm 10. No config enables it, because it
carries no default policy and throws unless given one. The remaining
rules cover only catalogs and package globs, so nothing kept install
behavior consistent across repos.

`configure()` now supplies a policy by default, exported as
`defaultPnpmWorkspaceSettings`: `engineStrict`, `hoist`,
`minimumReleaseAge`, and `strictPeerDependencies` are matched by value
and auto-fixed into place; `minimumReleaseAgeExclude` is required to
exist without pinning its contents; and `dangerouslyAllowAllBuilds`,
`publicHoistPattern`, `shamefullyHoist`, and `trustLockfile` are
forbidden outright.

The split between the three knobs is deliberate. `settings` compares
whole values and its fixer replaces the entire key/value pair, so
pinning a list a consumer extends would make `--fix` delete their added
scopes — hence the exclude list is required rather than value-matched.
`settings` also cannot express "anything but this value", so a setting
that is unsafe in one direction has to be banned by key instead.

Repos whose `pnpm-workspace.yaml` omits these settings will see new
warnings that `--fix` resolves. Pass a replacement policy to
`pnpmWorkspaceSettings` to change it, or `false` to keep the catalog
rules without the settings policy.
