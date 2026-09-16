import * as v from 'valibot';
import { parse } from 'yaml';
import { StringRecord } from './schemas.ts';
import { localeComparer } from './sort.ts';

/*
 * The catalog gate closes a hole `changeset status` cannot see. That check maps
 * changed *files* to packages, but a pnpm catalog moves every dependency range
 * to the workspace root, which belongs to no package — so a bump edits only
 * `pnpm-workspace.yaml` and no package looks changed. pnpm still rewrites
 * `catalog:` to the concrete range at pack time, so the published manifest of
 * every consumer changes with no version bump behind it.
 *
 * The gate stays quiet because of how Renovate writes these updates: with npm's
 * default `rangeStrategy`, an in-range bump touches only `pnpm-lock.yaml`, and
 * the catalog is edited only when the new version falls *outside* the declared
 * range. A catalog edit is therefore already a range-boundary crossing —
 * exactly the consumer-visible set. Flipping `rangeStrategy` to `bump` would
 * make every patch update edit the catalog and turn this gate into noise.
 */

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

/**
 * Catalog name → (dependency name → declared range).
 */
export type CatalogMap = ReadonlyMap<string, ReadonlyMap<string, string>>;

// Extracted so the `catalogs` entry below stays within max-nested-calls.
const NamedCatalogs = v.record(v.string(), StringRecord);

const CatalogsSchema = v.looseObject({
  catalog: v.optional(v.nullable(StringRecord)),
  catalogs: v.optional(v.nullable(NamedCatalogs)),
});

const mergeCatalog = (
  into: Map<string, Map<string, string>>,
  name: string,
  entries: Record<string, string>,
): void => {
  const existing = into.get(name) ?? new Map<string, string>();
  for (const [dependency, range] of Object.entries(entries)) {
    existing.set(dependency, range);
  }
  into.set(name, existing);
};

/**
 * Reads the `catalog:` and `catalogs:` blocks out of a `pnpm-workspace.yaml`
 * source. Both revisions are parsed and compared as maps rather than diffed as
 * text, so reordering or reformatting the file reports no change.
 */
export const parseCatalogs = (source: string): CatalogMap => {
  const parsed = v.parse(CatalogsSchema, parse(source) ?? {});
  const catalogs = new Map<string, Map<string, string>>();
  if (parsed.catalog) {
    mergeCatalog(catalogs, defaultCatalogName, parsed.catalog);
  }
  const named = Object.entries(parsed.catalogs ?? {});
  for (const [name, entries] of named) {
    mergeCatalog(catalogs, name, entries);
  }

  return catalogs;
};

/**
 * A catalog entry that gained a range or had it rewritten. `from` is
 * `undefined` for a newly added entry.
 */
export interface CatalogChange {
  readonly catalog: string;
  readonly from: string | undefined;
  readonly name: string;
  readonly to: string;
}

const compareChanges = (left: CatalogChange, right: CatalogChange): number =>
  localeComparer(left.catalog, right.catalog) ||
  localeComparer(left.name, right.name);

/**
 * Reports every catalog entry added or re-ranged between two revisions.
 *
 * Removals are deliberately not reported: an entry can only be orphaned by a
 * `package.json` edit that drops the `catalog:` specifier, and that edit
 * already makes the package look changed to `changeset status`.
 */
export const diffCatalogs = (
  base: CatalogMap,
  head: CatalogMap,
): readonly CatalogChange[] => {
  const changes: CatalogChange[] = [];
  for (const [catalog, entries] of head) {
    const baseEntries = base.get(catalog);
    for (const [name, to] of entries) {
      const from = baseEntries?.get(name);
      if (from !== to) {
        changes.push({ catalog, from, name, to });
      }
    }
  }

  return changes.toSorted(compareChanges);
};

const frontmatterPattern = /^---\r?\n(?<body>.*?)\r?\n?---/sv;

/**
 * Reads the package names a changeset's YAML frontmatter declares. An empty
 * changeset (`---\n---`) declares none, which is how a PR opts out of a
 * release — so it must not be mistaken for coverage.
 */
export const parseChangesetPackages = (source: string): readonly string[] => {
  const body = frontmatterPattern.exec(source)?.groups?.['body']?.trim() ?? '';
  if (body === '') {
    return [];
  }
  const result = v.safeParse(StringRecord, parse(body));

  return result.success ? Object.keys(result.output) : [];
};

/**
 * The subset of a discovered package this gate reads. Structurally satisfied
 * by `PackageCapabilities`.
 */
export interface CatalogConsumer {
  readonly catalogDependencies: readonly CatalogDependency[];
  readonly isPublished: boolean;
  readonly name: string;
}

/**
 * A catalog change that reaches a published package with nothing releasing it.
 */
export interface CatalogFinding {
  readonly change: CatalogChange;
  readonly packageName: string;
}

/**
 * Inputs to {@link findUncoveredCatalogChanges}.
 */
export interface FindUncoveredCatalogChangesOptions {
  readonly changes: readonly CatalogChange[];
  /**
   * Package names covered by a changeset in this PR.
   */
  readonly covered: ReadonlySet<string>;
  readonly ignored: ReadonlySet<string>;
  readonly packages: readonly CatalogConsumer[];
}

/**
 * Pairs each catalog change with every published package that publishes it as
 * a runtime dependency and has no changeset releasing it.
 */
export const findUncoveredCatalogChanges = (
  options: FindUncoveredCatalogChangesOptions,
): readonly CatalogFinding[] =>
  options.changes.flatMap(change =>
    options.packages
      .filter(pkg => pkg.isPublished)
      .filter(pkg => !options.ignored.has(pkg.name))
      .filter(pkg => !options.covered.has(pkg.name))
      .filter(pkg =>
        pkg.catalogDependencies.some(
          dep => dep.catalog === change.catalog && dep.name === change.name,
        ))
      .map(pkg => ({ change, packageName: pkg.name })));

/**
 * Renders a {@link CatalogFinding} as a single drift line.
 */
export const formatCatalogFinding = (
  { change, packageName }: CatalogFinding,
): string => {
  const entry = change.catalog === defaultCatalogName
    ? `catalog entry '${change.name}'`
    : `catalog '${change.catalog}' entry '${change.name}'`;
  const transition = change.from === undefined
    ? `was added as ${change.to}`
    : `changed ${change.from} → ${change.to}`;

  return `pnpm-workspace.yaml: ${entry} ${transition} — '${packageName}' ` +
    'publishes it as a runtime dependency but no changeset covers that package';
};
