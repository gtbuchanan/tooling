# The changeset gate

`gtb changeset check` is the PR releasability gate, and runs two checks against one base ref:

1. `changeset status`, delegated to changesets, which fails when a versionable package changed and no changeset exists at all. It runs first because its failure subsumes the second — with no changesets present, every catalog finding would be uncovered too.
1. The **catalog gate**, which fails when a pnpm catalog change reaches a published package with no changeset releasing it. It exists because `changeset status` maps changed **files** to packages, and a catalog moves every dependency range to `pnpm-workspace.yaml` at the workspace root — which belongs to no package. The bump therefore reads as "no package changed", while pnpm rewrites `catalog:` to the concrete range at pack time, so every consumer's published manifest moves with no version bump behind it.

- `gtb changeset check [--since <ref>] [--ignore <pkg>]` — the base ref defaults to `origin/main`. The catalog half diffs the `catalog:` / `catalogs:` blocks between HEAD and its merge base with that ref (the same fork point `changeset status` diffs from, so catalog edits that landed on the base after the branch forked aren't counted as the branch's), maps each changed entry to the published packages declaring it, and exits non-zero for any that no changeset covers.

Both halves share one command precisely so they cannot drift onto different base refs.

Both revisions are parsed and compared as maps, so reordering or reformatting `pnpm-workspace.yaml` reports nothing. Only runtime fields count (`dependencies`, `peerDependencies`, `optionalDependencies`) — publishing strips `devDependencies`, so a test-only bump never fires — and bundled dependencies are excluded, matching how `workspaceDependenciesOf` collects workspace dependencies. Private packages and anything in the changesets config's `ignore` are skipped. An empty changeset is **not** coverage: it is the documented way to say "no release", which is the claim the gate exists to challenge. Removed catalog entries are skipped, since orphaning one requires a `package.json` edit that `changeset status` already sees.

The gate is quiet in practice because of Renovate's `rangeStrategy`: under npm's default an in-range bump touches only `pnpm-lock.yaml`, and the catalog is edited only when the new version falls outside the declared range — so a catalog edit is already a range-boundary crossing, exactly the consumer-visible set. Switching to `rangeStrategy: bump` would make every patch update rewrite the catalog and turn the gate into noise.

A repo with no catalog no-ops.
