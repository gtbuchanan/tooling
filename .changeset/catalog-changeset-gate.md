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

The command runs `changeset status` first, so one invocation covers both the
stock "a changeset exists" requirement and the catalog gate against a single
base ref instead of specifying it twice. `changeset-check.yml` is now one step,
behind the same `gtb-from-source` input `cd.yml` uses. The
`pnpm-resolve-pinned` + `pnpm dlx` indirection is gone: it existed only to
avoid an install the gtb bin needs anyway, and it already required
`@changesets/cli` to be a root devDependency to resolve from the lockfile.

`PackageCapabilities` gains a `catalogDependencies` field.
