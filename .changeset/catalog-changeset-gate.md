---
'@gtbuchanan/cli': minor
---

Add `gtb changeset check`, a catalog-aware changeset gate.

`changeset status` maps changed files to packages, but a pnpm catalog moves
every dependency range to `pnpm-workspace.yaml` at the workspace root, which
belongs to no package. A catalog bump therefore reads as "no package changed",
while pnpm rewrites `catalog:` to the concrete range at pack time — so every
consumer's published manifest moves with no version bump behind it, and the new
range sits unreleased until some unrelated PR happens to bump the package.

The gate diffs the `catalog:` / `catalogs:` blocks between a base ref and HEAD,
maps each changed entry to the published packages declaring it in a runtime
dependency field, and fails when no changeset covers them. `devDependencies`,
bundled dependencies, private packages, and anything in the changesets config's
`ignore` are excluded, and an empty changeset does not count as coverage.

`changeset-check.yml` runs it alongside the existing `changeset status` gate,
behind the same `gtb-from-source` input `cd.yml` uses. Since the job now
installs for the gtb bin, the stock check moved from `pnpm dlx` to
`pnpm exec` — the `pnpm-resolve-pinned` indirection existed only to avoid the
install, and it already required `@changesets/cli` to be a root devDependency
to resolve the version from the lockfile.

`PackageCapabilities` gains a `catalogDependencies` field.
