import type { WorkspacePackage } from '#src/core/discovery.js';
import type { Manifest } from '#src/core/manifest.js';
import { localeComparer } from '#src/core/sort.js';

/**
 * Manifest fields a published tarball carries into a consumer's install.
 */
const runtimeDependencyFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

type RuntimeDependencyField = typeof runtimeDependencyFields[number];

/**
 * The one field `bundleDependencies: true` covers.
 */
const bundleAllField: RuntimeDependencyField = 'dependencies';

/**
 * Builds the "does the tarball ship this itself?" predicate from
 * `bundleDependencies` (or its `bundledDependencies` alias). A bundled package
 * never resolves from the registry, so its specifier can't 404.
 *
 * The two forms bundle different things, measured against `pnpm pack`:
 * an explicit name list bundles that package out of whichever field declares
 * it, while `true` covers `dependencies` alone — a workspace peer or optional
 * dependency keeps its rewritten specifier but is left out of the tarball, so
 * treating `true` as "everything" would hide the exact breakage this feeds.
 *
 * (pnpm honors `bundleDependencies` only under `nodeLinker: hoisted`; it
 * hard-errors on the default isolated linker.)
 */
const bundledPredicate = (
  manifest: Manifest,
): ((field: RuntimeDependencyField, name: string) => boolean) => {
  const bundled = manifest.bundleDependencies ?? manifest.bundledDependencies;
  if (bundled === undefined || bundled === false) {
    return () => false;
  }

  if (bundled === true) {
    return field => field === bundleAllField;
  }

  const names = new Set(bundled);

  return (_field, name) => names.has(name);
};

/**
 * Names of the workspace packages a package depends on *at install time*:
 * every `workspace:` specifier in `dependencies`, `peerDependencies`, or
 * `optionalDependencies` that the tarball doesn't ship itself. Sorted and
 * deduplicated.
 *
 * All three fields survive publish and get pnpm's `workspace:` → concrete
 * version rewrite at pack time, so each one can point a consumer at a
 * version that was never published. `devDependencies` is excluded because
 * publishing strips it — a build-time-only workspace package (one a bundler
 * inlines, say) belongs there and is correctly invisible here. So is
 * anything `bundleDependencies` actually bundles; see {@link
 * bundledPredicate} for why that isn't the whole field.
 */
export const workspaceDependenciesOf = (
  { manifest }: WorkspacePackage,
): readonly string[] => {
  const isBundled = bundledPredicate(manifest);
  const names = runtimeDependencyFields.flatMap(field =>
    Object.entries(manifest[field] ?? {})
      .filter(([name, spec]) => spec.startsWith('workspace:') && !isBundled(field, name))
      .map(([name]) => name),
  );

  return [...new Set(names)].toSorted(localeComparer);
};

/**
 * Catalog name for pnpm's top-level `catalog:` block. pnpm also accepts it
 * spelled explicitly as `catalog:default`.
 */
export const defaultCatalogName = 'default';

/**
 * One catalog-backed dependency declaration: which catalog it resolves
 * against, and the dependency name.
 */
export interface CatalogDependency {
  readonly catalog: string;
  readonly name: string;
}

const catalogPrefix = 'catalog:';

/**
 * Resolves the catalog a specifier reads from, or `undefined` when the
 * specifier isn't catalog-backed. Bare `catalog:` and the explicit
 * `catalog:default` both name the default catalog.
 */
const resolveCatalogName = (specifier: string): string | undefined => {
  if (!specifier.startsWith(catalogPrefix)) {
    return undefined;
  }
  const named = specifier.slice(catalogPrefix.length).trim();

  return named === '' ? defaultCatalogName : named;
};

/**
 * Catalog-backed dependencies a package carries into a consumer's install,
 * sorted and deduplicated.
 *
 * pnpm rewrites a `catalog:` specifier to the catalog's concrete range at pack
 * time, so the published manifest changes whenever that range does — which is
 * why re-ranging a catalog entry is a consumer-visible change even though no
 * file inside the package moved.
 *
 * The field set and the `bundleDependencies` exclusion mirror
 * {@link workspaceDependenciesOf} for the same reasons: publishing strips
 * `devDependencies`, and a bundled dependency ships inside the tarball rather
 * than resolving from the registry, so neither range reaches a consumer.
 */
export const catalogDependenciesOf = (
  { manifest }: Pick<WorkspacePackage, 'manifest'>,
): readonly CatalogDependency[] => {
  const isBundled = bundledPredicate(manifest);
  const refs = runtimeDependencyFields.flatMap(field =>
    Object.entries(manifest[field] ?? {})
      .filter(([name]) => !isBundled(field, name))
      .flatMap(([name, specifier]) => {
        const catalog = resolveCatalogName(specifier);

        return catalog === undefined ? [] : { catalog, name };
      }),
  );
  const seen = new Map(refs.map(ref => [`${ref.catalog} ${ref.name}`, ref]));

  return seen.values().toArray().toSorted((left, right) =>
    localeComparer(left.catalog, right.catalog) ||
    localeComparer(left.name, right.name));
};
