# @gtbuchanan/cli

## 0.7.0

### Minor Changes

- 6b1453b: Verify that published packages declare no private workspace dependencies

  `gtb verify` (scope `manifest`) now asserts that every install-time
  `workspace:` dependency of a published package is itself published. pnpm
  rewrites the specifier to the linked package's concrete version at pack
  time without checking that the version ever reached the registry, so a
  private workspace package ships in the tarball as a dependency no
  consumer can resolve.

  Covers `dependencies`, `peerDependencies`, and `optionalDependencies`.
  `devDependencies` are exempt (publishing strips them) as is anything
  `bundleDependencies` actually bundles — an explicit name list covers any
  field, while `true` covers `dependencies` alone, so a workspace peer or
  optional dependency stays checked.

### Patch Changes

- c897a61: Make `gtb publish` resilient to partial release failures

  A release run no longer aborts on the first problem it meets. Failures are
  collected and re-thrown together, so one package or channel can't strand the
  rest, and the run reports everything that went wrong instead of only the first
  thing.

  The skip-if-exists check now reads a single `gh release list` rather than a
  `gh release view` per package, and a failed listing raises instead of being
  read as "nothing is released" — which previously sent every package on to a
  create that could only fail. A create GitHub rejects because the tag is
  already taken now counts as released, covering both a race with the listing
  and a tag reserved by a deleted immutable release.

## 0.6.0

### Minor Changes

- 78a2495: Propagate workspace dependency source changes into `typecheck:ts`,
  `lint:eslint`, and `test:vitest:*` caches

  `typecheck:ts` declared no topological edge, so a change to a workspace
  dependency's source left its consumers' type-check cache valid and CI
  replayed a stale pass. `gtb sync` now emits a scriptless `transit` node
  (`dependsOn: ["^transit"]`) and depends on it from `typecheck:ts`,
  `lint:eslint`, and every `test:vitest:*` task. It runs nothing, so
  nothing serializes; it just carries every transitive workspace
  dependency's file hashes into the consumer's task hash — including
  dependencies with no `compile:ts` script, which `^compile:ts` could
  never reach.

  `test:vitest:e2e` is included: it reads packed tarballs, but its own
  sources import fixture helpers from source-only workspace packages.
  Its `^pack` edge covers that only incidentally — for direct
  dependencies, and not at all when the workspace packs nothing.

  `transit` declares no `inputs`, so it hashes every tracked file in a
  dependency. Edits that a consumer's own `inputs` would have ignored (a
  dependency's `README.md`, for instance) now invalidate that consumer's
  cache — the trade for never replaying a stale pass.

  The test tasks' topological edge also moves from the `compile:ts` leaf to
  the `compile` aggregate, so a dependency whose output comes from another
  compile flavour (`compile:skills`) gates its consumers too.

  Re-run `gtb sync` after upgrading — `gtb verify` reports drift until
  `turbo.json` is regenerated. No package needs a `transit` script.

### Patch Changes

- de57c6b: Fix root-package paths in the generated `codecov.yml`. A single-package
  repo's sole package is the workspace root, so its path relative to the root
  is empty — component paths came out absolute (`/src/**`) and matched nothing
  in a root-relative coverage report, and its flag path was a bare `/`. Root
  components are now written repo-relative (`src/**`) and the root flag omits
  `paths` entirely, which Codecov already reads as "every file".

  `src/**` is also no longer emitted unconditionally: it appears only when the
  package has a `src/` directory, mirroring the existing `bin/` and `scripts/`
  guards. A package with none of the three falls back to its own directory
  glob, since Codecov treats an empty path list as the whole repo.

## 0.5.0

### Minor Changes

- 58c8c7c: Derive Codecov flag and component names from the unscoped package name

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

- e1b02d3: Scaffold `tsconfig.base.json` in `gtb sync` and verify its presence

  `gtb sync` generates configs that extend `./tsconfig.base.json` but
  never created it, leaving a fresh consumer silently broken. Sync now
  scaffolds the base (extending `@gtbuchanan/tsconfig/node.json`) when
  absent — never overwriting an edited variant — and `gtb verify` reports
  drift when it's missing.

### Patch Changes

- 2c55ea0: Pair jsdoc/require-asterisk-prefix with unicorn's block comment rule

  eslint-plugin-unicorn v73 adds `single-line-block-comment-style`, which
  expands one-line block comments to multiline. It deliberately stops
  short of the asterisk gutter, leaving JSDoc internals to
  eslint-plugin-jsdoc — see
  https://github.com/sindresorhus/eslint-plugin-unicorn/issues/3603.
  Enabling `jsdoc/require-asterisk-prefix` completes the pair, so `--fix`
  lands on standard gutter JSDoc. Plain block comments keep no gutter,
  mirroring the doc-vs-incidental split that `///` and `//` draw in C#.

  v73 also adds `consistent-boolean-name`. `try` joins the allowed
  prefixes: it marks an action that reports whether it succeeded, the
  established Try* idiom, which none of the default prefixes express.

## 0.4.0

### Minor Changes

- 78acd0d: `gtb publish` now creates a GitHub release for every published npm package
  (title = tag, notes = the version's CHANGELOG section), landing the release
  tag on GitHub via the API — previously `changeset publish` created tags only
  in the runner's local clone, so npm releases shipped untagged. Both release
  channels (npm and Pkl) now also pass `--target HEAD` so a local re-run tags
  the commit actually being published rather than the remote default branch.

## 0.3.0

### Minor Changes

- f0a9703: Declare `generate:*` tasks so turbo can actually run them

  `gtb sync` named every discovered `generate:*` script in the root
  `generate` aggregate's `dependsOn` but never emitted a task definition
  for it. In a monorepo turbo refuses to build the graph at all in that
  state — `Could not find "<pkg>#generate:prisma" in root turbo.json` —
  so any consumer that added a codegen script broke every `turbo run`.

  Only the package knows what its codegen reads and writes, and a task
  with no `outputs` restores nothing on a cache hit, so sync no longer
  guesses:

  - **Monorepo** — the root aggregate is emitted empty and each package
    declares its own leaves in a package configuration
    (`packages/<pkg>/turbo.json` extending `//`), where it can give them
    real `inputs`/`outputs`. `gtb verify` reports a package that has
    `generate:*` scripts but no such configuration, a leaf missing from
    `generate`'s `dependsOn`, or a leaf declaring neither `outputs` nor
    `cache: false` — without the check, a missing configuration silently
    skips generation and leaves downstream tasks reading stale files.
  - **Single-package repo** — turbo offers package configurations only
    for workspace packages, so sync declares the leaves itself with
    `cache: false`.

  Repos with no `generate:*` scripts generate the same `turbo.json` as
  before.

### Patch Changes

- c97db0a: Publish runtime dependencies as caret ranges instead of exact pins

  The `catalog:` entries backing these packages' runtime dependencies were
  exact pins, and pnpm substitutes the catalog spec verbatim at publish
  time — so consumers received hard pins that force a duplicate install
  whenever they resolve a different version of the same package. Exact
  pins remain only on root devDependencies, which are never published.

- 865b030: Fix `coverage:vitest:merge` failing under vitest 4 by overriding the
  reporter for the merge invocation (`--reporter=default`). Vitest 4
  rejects `--merge-reports` while `blob` is an active reporter, and the
  shared config enables `blob` unconditionally so the fast/slow runs can
  produce the per-bucket blobs.
- 9aac2b6: Stop generating recursive aggregate scripts in single-package repos

  `gtb sync` no longer writes the `check` / `build` / `build:ci` / `pack` /
  `test:slow` / `test:e2e` / `coverage:merge` root aliases when the root is
  the lone package. There, turbo resolves the aggregate to the root script,
  which re-invokes turbo, and the run aborts on turbo's
  `recursive_turbo_invocations` guard. Dispatch aggregates directly instead
  (`gtb turbo run check`); the leaf scripts, which call `gtb task`, are
  unchanged.

  `gtb verify` now reports a root script that shadows an aggregate so repos
  synced before this change learn which scripts to delete.

- a48285d: Fix `gtb sync`/`gtb verify` disagreeing on tsconfigs in single-package repos

  When the workspace root is itself the lone package, the root and
  per-package tsconfig layers of the sync plan target the same
  `tsconfig.json` / `tsconfig.build.json`. The package layer won, writing an
  `extends` of `../../tsconfig.base.json` that resolves outside the repo
  (`TS5083`), and `verify` reported drift against whichever layer it
  compared — so it could never pass, leaving the `Config Check` job
  permanently red.

  The plan now collapses layers that land on the same file, keeping the
  root layer's `extends` while folding in the package layer's
  `compilerOptions` and `include`. Package `extends` paths are also derived
  from the package's actual depth below the root instead of assuming a
  `packages/<name>` layout, so a package nested one level deep resolves
  correctly too.

## 0.2.1

### Patch Changes

- 9ff09c7: Fix `gtb` crashing on startup when TypeScript 7 is the resolved compiler

  `tsconfig-gen` resolved a package's build `include` through the classic
  `typescript` compiler API (`ts.sys`, `ts.readConfigFile`,
  `ts.parseJsonConfigFileContent`). TypeScript 7 restructured its npm package so
  those are no longer exposed from the main entry, leaving `ts.sys` undefined and
  crashing every `gtb` command at module load. The build `include` is now read
  with `get-tsconfig`, which mirrors tsc's `extends` resolution — relative paths
  and node_modules package specifiers alike — without depending on the
  `typescript` package. `typescript` remains a peer dependency for the
  `tsc`-backed `compile:ts` / `typecheck:ts` tasks.

## 0.2.0

### Minor Changes

- 53d0534: Add `gtb version` and fold npm publishing into `gtb publish`

  `gtb version` runs `changeset version` then a `manifest`-scoped sync in one
  process, so any regenerated native manifest (e.g. a Pkl `PklProject`) lands in
  the same changesets version commit/PR. CD passes it as changesets/action's
  `version` command — the chaining lives in `gtb` because the action splits its
  `version` input on whitespace and execs it without a shell, so a `&&` chain is
  passed to changesets as bogus args.

  `gtb publish` now runs `changeset publish` (npm) before dispatching the non-npm
  channels, making it the single publish command for a release. Both halves stay
  idempotent and no-op when the workspace ships no such package.

### Patch Changes

- 02e25ff: Drop hk batching/diff workarounds fixed upstream in hk 1.47

  hk 1.47 made auto-batching respect the platform command-line limit
  (cmd.exe on Windows) and added a no-merge-base fallback for ref diffs,
  so the local workarounds are no longer needed:

  - `@gtbuchanan/hk-config`: drop the `batchFiles` primitive and the
    per-step `batch` wiring from `fileHygiene` — hk auto-batches under the
    arg limit on its own.
  - `@gtbuchanan/cli`: `gtb hk all` no longer sets `HK_BATCH`, and
    `gtb hk base` hands the range to hk as `--from-ref=<base> --to-ref=HEAD`
    instead of pre-computing the changed-file list.

- d8f16ea: Ship README and LICENSE in published npm tarballs

  `pack:npm` now copies each package's `README.md` and the workspace-root
  `LICENSE` into `dist/source/` (the directory `publishConfig.directory`
  redirects publishing to), and the published `package.json` carries a
  `license` field. A package-level `README`/`LICENSE`/`license` overrides the
  shared root one. Re-publishes every package so the first release's missing
  docs are corrected.
