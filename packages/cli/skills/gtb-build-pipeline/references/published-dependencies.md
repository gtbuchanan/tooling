# Published packages and their workspace dependencies

`gtb verify` fails a published package that declares a private workspace package among its install-time dependencies (`dependencies`, `peerDependencies`, `optionalDependencies`). Two details of that check are easy to get wrong.

**`bundleDependencies: true` is not a blanket exemption.** Its two forms bundle different things, measured against `pnpm pack`: an explicit name list bundles that package out of whichever field declares it, while `true` covers `dependencies` alone. A workspace peer or optional dependency under `true` keeps its rewritten specifier but never reaches the tarball, so it stays checked. (pnpm honors `bundleDependencies` only under `nodeLinker: hoisted` — it hard-errors with `ERR_PNPM_BUNDLED_DEPENDENCIES_WITHOUT_HOISTED` on the default isolated linker, so none of this applies to a workspace on pnpm's defaults.)

An e2e suite won't catch this on your behalf. A harness that installs each workspace dependency's local tarball alongside the package under test resolves a private dependency perfectly well; only a real consumer 404s. That gap is what makes the static check worth having.
