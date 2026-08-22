import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import {
  diffCatalogs,
  findUncoveredCatalogChanges,
  formatCatalogFinding,
  parseCatalogs,
  parseChangesetPackages,
} from '#src/lib/catalog-gate.js';
import { collectCatalogDependencies } from '#src/lib/discovery.js';

const workspaceYaml = (body: string): string => `packages:\n  - 'packages/*'\n${body}`;

const catalogOf = (name: string, range: string): string =>
  workspaceYaml(`catalog:\n  ${name}: '${range}'\n`);

const twoCatalogs = (
  name: string,
  defaultRange: string,
  legacyRange: string,
): string =>
  workspaceYaml(
    `catalog:\n  ${name}: '${defaultRange}'\n` +
    `catalogs:\n  legacy:\n    ${name}: '${legacyRange}'\n`,
  );

const changeOf = (name: string) => ({
  catalog: 'default',
  from: '^1.0.0',
  name,
  to: '^2.0.0',
});

const consumerOf = (packageName: string, dependency: string, isPublished = true) => ({
  catalogDependencies: [{ catalog: 'default', name: dependency }],
  isPublished,
  name: packageName,
});

describe.concurrent(parseCatalogs, () => {
  it('reads an entry from the default catalog', ({ expect }) => {
    const name = build.packageName();
    const range = build.semverRange();

    const catalogs = parseCatalogs(catalogOf(name, range));

    expect(catalogs.get('default')?.get(name)).toBe(range);
  });

  it('keeps a named catalog separate from the default', ({ expect }) => {
    const name = build.packageName();
    const defaultRange = build.semverRange();
    const namedRange = build.semverRange();

    const catalogs = parseCatalogs(twoCatalogs(name, defaultRange, namedRange));

    expect(catalogs.get('default')?.get(name)).toBe(defaultRange);
    expect(catalogs.get('legacy')?.get(name)).toBe(namedRange);
  });

  it('reports no catalogs when the workspace declares none', ({ expect }) => {
    expect(parseCatalogs(workspaceYaml('')).size).toBe(0);
  });
});

describe.concurrent(diffCatalogs, () => {
  it('reports an entry whose range changed, with both ranges', ({ expect }) => {
    const name = build.packageName();

    const changes = diffCatalogs(
      parseCatalogs(catalogOf(name, '^1.0.0')),
      parseCatalogs(catalogOf(name, '^2.0.0')),
    );

    expect(changes).toStrictEqual([
      { catalog: 'default', from: '^1.0.0', name, to: '^2.0.0' },
    ]);
  });

  it('reports an added entry with no previous range', ({ expect }) => {
    const name = build.packageName();
    const to = build.semverRange();

    const changes = diffCatalogs(
      parseCatalogs(workspaceYaml('')),
      parseCatalogs(catalogOf(name, to)),
    );

    expect(changes).toStrictEqual([
      { catalog: 'default', from: undefined, name, to },
    ]);
  });

  it('ignores an entry whose range is unchanged', ({ expect }) => {
    const source = catalogOf(build.packageName(), build.semverRange());

    expect(diffCatalogs(parseCatalogs(source), parseCatalogs(source))).toStrictEqual([]);
  });

  /*
   * A removed entry can only be orphaned by a package.json edit, which
   * `changeset status` already sees — so it is not this gate's business.
   */
  it('ignores a removed entry', ({ expect }) => {
    const source = catalogOf(build.packageName(), build.semverRange());

    const changes = diffCatalogs(
      parseCatalogs(source),
      parseCatalogs(workspaceYaml('')),
    );

    expect(changes).toStrictEqual([]);
  });

  it('treats the same dependency in two catalogs as distinct', ({ expect }) => {
    const name = build.packageName();

    const changes = diffCatalogs(
      parseCatalogs(twoCatalogs(name, '^1.0.0', '^1.0.0')),
      parseCatalogs(twoCatalogs(name, '^2.0.0', '^1.0.0')),
    );

    expect(changes).toStrictEqual([
      { catalog: 'default', from: '^1.0.0', name, to: '^2.0.0' },
    ]);
  });
});

describe.concurrent(collectCatalogDependencies, () => {
  it('collects a catalog-backed runtime dependency', ({ expect }) => {
    const name = build.packageName();

    const result = collectCatalogDependencies({ dependencies: { [name]: 'catalog:' } });

    expect(result).toStrictEqual([{ catalog: 'default', name }]);
  });

  it('resolves an explicitly named catalog specifier', ({ expect }) => {
    const name = build.packageName();

    const result = collectCatalogDependencies({
      dependencies: { [name]: 'catalog:legacy' },
    });

    expect(result).toStrictEqual([{ catalog: 'legacy', name }]);
  });

  it('collects peerDependencies and optionalDependencies', ({ expect }) => {
    const peer = build.packageName();
    const optional = build.packageName();

    const result = collectCatalogDependencies({
      optionalDependencies: { [optional]: 'catalog:' },
      peerDependencies: { [peer]: 'catalog:' },
    });

    expect(result).toContainEqual({ catalog: 'default', name: peer });
    expect(result).toContainEqual({ catalog: 'default', name: optional });
  });

  // Publishing strips devDependencies, so they never reach a consumer.
  it('excludes devDependencies', ({ expect }) => {
    const name = build.packageName();

    const result = collectCatalogDependencies({
      devDependencies: { [name]: 'catalog:' },
    });

    expect(result).toStrictEqual([]);
  });

  it('excludes a dependency the tarball bundles', ({ expect }) => {
    const name = build.packageName();

    const result = collectCatalogDependencies({
      bundleDependencies: [name],
      dependencies: { [name]: 'catalog:' },
    });

    expect(result).toStrictEqual([]);
  });

  it('ignores a specifier that is not catalog-backed', ({ expect }) => {
    const name = build.packageName();

    const result = collectCatalogDependencies({
      dependencies: { [name]: build.semverRange() },
    });

    expect(result).toStrictEqual([]);
  });
});

describe.concurrent(parseChangesetPackages, () => {
  it('reads the package names a changeset declares', ({ expect }) => {
    const first = build.scopedPackageName();
    const second = build.scopedPackageName();

    const result = parseChangesetPackages(
      `---\n'${first}': patch\n'${second}': minor\n---\n\nSome summary\n`,
    );

    expect(new Set(result)).toStrictEqual(new Set([first, second]));
  });

  it('reports no packages for an empty changeset', ({ expect }) => {
    expect(parseChangesetPackages('---\n---\n\nUpdate CI workflow\n')).toStrictEqual([]);
  });

  it('reports no packages when the file has no frontmatter', ({ expect }) => {
    expect(parseChangesetPackages('Just prose, no frontmatter\n')).toStrictEqual([]);
  });
});

describe.concurrent(findUncoveredCatalogChanges, () => {
  it('flags a published consumer with no changeset covering it', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const findings = findUncoveredCatalogChanges({
      changes: [changeOf(dependency)],
      covered: new Set(),
      ignored: new Set(),
      packages: [consumerOf(packageName, dependency)],
    });

    expect(findings).toStrictEqual([
      { change: changeOf(dependency), packageName },
    ]);
  });

  it('accepts a changeset that covers the consumer', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const findings = findUncoveredCatalogChanges({
      changes: [changeOf(dependency)],
      covered: new Set([packageName]),
      ignored: new Set(),
      packages: [consumerOf(packageName, dependency)],
    });

    expect(findings).toStrictEqual([]);
  });

  it('skips a private consumer', ({ expect }) => {
    const dependency = build.packageName();

    const findings = findUncoveredCatalogChanges({
      changes: [changeOf(dependency)],
      covered: new Set(),
      ignored: new Set(),
      packages: [consumerOf(build.scopedPackageName(), dependency, false)],
    });

    expect(findings).toStrictEqual([]);
  });

  it('skips an explicitly ignored consumer', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const findings = findUncoveredCatalogChanges({
      changes: [changeOf(dependency)],
      covered: new Set(),
      ignored: new Set([packageName]),
      packages: [consumerOf(packageName, dependency)],
    });

    expect(findings).toStrictEqual([]);
  });

  it('ignores a catalog change no published package consumes', ({ expect }) => {
    const findings = findUncoveredCatalogChanges({
      changes: [changeOf(build.packageName())],
      covered: new Set(),
      ignored: new Set(),
      packages: [consumerOf(build.scopedPackageName(), build.packageName())],
    });

    expect(findings).toStrictEqual([]);
  });

  it('does not match a change in a different catalog', ({ expect }) => {
    const dependency = build.packageName();
    const change = { catalog: 'legacy', from: '^1.0.0', name: dependency, to: '^2.0.0' };

    const findings = findUncoveredCatalogChanges({
      changes: [change],
      covered: new Set(),
      ignored: new Set(),
      packages: [consumerOf(build.scopedPackageName(), dependency)],
    });

    expect(findings).toStrictEqual([]);
  });
});

describe.concurrent(formatCatalogFinding, () => {
  it('names the entry, both ranges, and the package', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const message = formatCatalogFinding({
      change: changeOf(dependency),
      packageName,
    });

    expect(message).toContain(dependency);
    expect(message).toContain('^1.0.0');
    expect(message).toContain('^2.0.0');
    expect(message).toContain(packageName);
  });

  it('renders an added entry without inventing a previous range', ({ expect }) => {
    const dependency = build.packageName();

    const message = formatCatalogFinding({
      change: { catalog: 'default', from: undefined, name: dependency, to: '^2.0.0' },
      packageName: build.scopedPackageName(),
    });

    expect(message).toContain('added');
    expect(message).not.toContain('undefined');
  });
});
