---
'@gtbuchanan/cli': minor
---

Derive Codecov flag and component names from the unscoped package name

`gtb sync` named `codecov.yml` flags and components after each package's
directory basename. A basename belongs to the checkout, not the package:
editing a single-package repo in a worktree named `myrepo.feat-x` wrote
`flags."myrepo.feat-x"`, which CI — checked out elsewhere — regenerated as
`myrepo`, so `gtb verify` drift-failed. Names now come from the unscoped
`package.json` name (`@acme/utils` → `utils`), which is identical in every
checkout. `coverage:codecov:upload` derives its `-F` flag the same way, so
uploads keep matching the generated config.

Repos whose package directories already match their unscoped names see no
change. Elsewhere, re-run `gtb sync` to regenerate `codecov.yml`; the
renamed flags start without carryforward history.

The old duplicate-directory-basename guard is replaced by one on the
derived names: packages that differ only by scope (`@a/utils`, `@b/utils`)
now fail sync, while packages sharing a directory basename are allowed.
