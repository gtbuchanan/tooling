# The catalog changeset gate

`changeset status` maps changed **files** to packages, and a pnpm catalog moves every dependency range to `pnpm-workspace.yaml` at the workspace root, which belongs to no package. A catalog bump therefore reads as "no package changed", while pnpm rewrites `catalog:` to the concrete range at pack time, so every consumer's published manifest moves with no version bump behind it. `gtb changeset check` closes that gap.

- `gtb changeset check [--since <ref>] [--ignore <pkg>]` — diffs the `catalog:` / `catalogs:` blocks between the base ref (default `origin/main`) and HEAD, maps each changed entry to the published packages declaring it, and exits non-zero for any that no changeset covers.

Both revisions are parsed and compared as maps, so reordering or reformatting `pnpm-workspace.yaml` reports nothing. Only runtime fields count (`dependencies`, `peerDependencies`, `optionalDependencies`) — publishing strips `devDependencies`, so a test-only bump never fires — and bundled dependencies are excluded, matching how `workspaceDependenciesOf` collects workspace dependencies. Private packages and anything in the changesets config's `ignore` are skipped. An empty changeset is **not** coverage: it is the documented way to say "no release", which is the claim the gate exists to challenge. Removed catalog entries are skipped, since orphaning one requires a `package.json` edit that `changeset status` already sees.

The gate is quiet in practice because of Renovate's `rangeStrategy`: under npm's default an in-range bump touches only `pnpm-lock.yaml`, and the catalog is edited only when the new version falls outside the declared range — so a catalog edit is already a range-boundary crossing, exactly the consumer-visible set. Switching to `rangeStrategy: bump` would make every patch update rewrite the catalog and turn the gate into noise.

A repo with no catalog no-ops.
