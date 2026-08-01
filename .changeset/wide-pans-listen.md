---
'@gtbuchanan/eslint-config': minor
---

Derive lint ignores from `.gitignore`

`configure()` now reads `.gitignore` through `eslint-config-flat-gitignore` and contributes the converted patterns as a global-ignores entry, so untracked paths — build output, caches, generated files — are never linted without being enumerated. Nested `.gitignore` files are discovered too, and a repo without one contributes no patterns instead of throwing.

The new `gitignore` option takes `false` to opt out, or a `FlatGitignoreOptions` object merged over `defaultGitignoreOptions`.

Because `.gitignore` now covers generated paths, the default `ignores` list was narrowed to the **tracked** files another tool owns the format of: lockfiles — matched by naming convention rather than per package manager — and `CHANGELOG.md`. That list is exported as `defaultIgnores` so it can be spread when overriding, since `ignores` replaces its default wholesale.

Repos that pass `gitignore: false` and relied on the previous defaults to skip build output now have to list those paths themselves.
