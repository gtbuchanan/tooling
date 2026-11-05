---
'@gtbuchanan/cli': minor
---

Add `gtb changeset check`, a changeset gate that sees catalog bumps

`changeset status` maps changed files to packages, but a pnpm catalog bump
edits only `pnpm-workspace.yaml`, which belongs to no package. pnpm still
rewrites `catalog:` to the new range at pack time, so every consumer's
published manifest moves with no version bump behind it.

The command runs `changeset status`, then diffs the `catalog:` and `catalogs:`
blocks between HEAD and its merge base with `--since`. It fails when a changed
entry reaches a published package's runtime dependencies and no changeset
covers that package. Dev and bundled dependencies, private packages and the
changesets `ignore` list are excluded, and an empty changeset is not coverage.

`changeset-check.yml` now runs this command, so its caller must depend on
`@gtbuchanan/cli`.
