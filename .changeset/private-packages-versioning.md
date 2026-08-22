---
---

Restore private-package versioning after the `@changesets/cli` v3 upgrade.

v3 changed the `privatePackages` default from `{ tag: false, version: true }`
to `false`, and the upgrade landed as a bare dependency bump with no config
migration. That silently dropped `@gtbuchanan/hk-config` out of
`changeset version`, freezing the version that `gtb sync` stamps into
`PklProject` and that `gtb publish` derives the release tag from — so the next
`Defaults.pkl` change would have been skipped by the release-exists check and
never shipped to consumers, with no error.

`privatePackages.version` is global, so `@gtbuchanan/test-utils` is added to
`ignore` to keep the gate scoped to the one private package whose version is
load-bearing. It is a `devDependency` everywhere it appears, and changesets'
skipped-dependents validation ignores devDependency edges, so the entry raises
no `Invalid tree` error.

Also repoints `$schema` at the v4 config schema, which the v3 upgrade left
stale — the correct schema is what surfaces `privatePackages` in an editor.
