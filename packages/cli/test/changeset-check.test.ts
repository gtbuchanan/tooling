import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import {
  type CatalogGateDeps,
  checkCatalogGate,
  readBaseWorkspace,
} from '#src/commands/root/changeset.js';
import type { ExecResult } from '#src/lib/process.js';

const ok = (stdout: string): ExecResult => ({ exitCode: 0, stderr: '', stdout });
const fail = (stderr: string): ExecResult => ({ exitCode: 1, stderr, stdout: '' });

const catalogYaml = (entries: string): string =>
  `packages:\n  - 'packages/*'\ncatalog:\n${entries}`;

const catalogOf = (dependency: string, range: string): string =>
  catalogYaml(`  ${dependency}: '${range}'\n`);

const publishedConsumer = (packageName: string, dependency: string) => ({
  catalogDependencies: [{ catalog: 'default', name: dependency }],
  isPublished: true,
  name: packageName,
});

/**
 * Builds deps whose `git` responses are keyed by subcommand.
 */
const depsFor = (
  responses: Readonly<Record<string, ExecResult>>,
): CatalogGateDeps => ({
  execute: (_command, args) =>
    Promise.resolve(responses[args[0] ?? ''] ?? fail('unexpected call')),
});

describe.concurrent(checkCatalogGate, () => {
  it('reports a published consumer of a re-ranged entry', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: [],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [publishedConsumer(packageName, dependency)],
    });

    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(packageName);
    expect(drift[0]).toContain(dependency);
  });

  it('reports nothing when the catalog is untouched', ({ expect }) => {
    const dependency = build.packageName();
    const source = catalogOf(dependency, '^1.0.0');

    const drift = checkCatalogGate({
      baseWorkspace: source,
      changesetSources: [],
      headWorkspace: source,
      ignored: new Set(),
      packages: [publishedConsumer(build.scopedPackageName(), dependency)],
    });

    expect(drift).toStrictEqual([]);
  });

  it('accepts a changeset naming the affected package', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: [`---\n'${packageName}': patch\n---\n\nBump it\n`],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [publishedConsumer(packageName, dependency)],
    });

    expect(drift).toStrictEqual([]);
  });

  /*
   * An empty changeset is the documented way to say "no release", which is
   * exactly the claim this gate exists to challenge.
   */
  it('rejects an empty changeset as coverage', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: ['---\n---\n\nUpdate CI workflow\n'],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [publishedConsumer(packageName, dependency)],
    });

    expect(drift).toHaveLength(1);
  });

  it('accepts a changeset for one package while flagging another', ({ expect }) => {
    const dependency = build.packageName();
    const covered = build.scopedPackageName();
    const uncovered = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: [`---\n'${covered}': patch\n---\n\nBump it\n`],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [
        publishedConsumer(covered, dependency),
        publishedConsumer(uncovered, dependency),
      ],
    });

    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(uncovered);
  });
});

describe.concurrent(readBaseWorkspace, () => {
  it('returns the base revision of the workspace file', async ({ expect }) => {
    const source = catalogOf(build.packageName(), '^1.0.0');
    const deps = depsFor({
      'cat-file': ok(''),
      'rev-parse': ok('abc123'),
      'show': ok(source),
    });

    const result = await readBaseWorkspace('origin/main', deps);

    expect(result).toBe(source);
  });

  it('treats a base predating the file as having no catalogs', async ({ expect }) => {
    const deps = depsFor({
      'cat-file': fail('does not exist'),
      'rev-parse': ok('abc123'),
    });

    const result = await readBaseWorkspace('origin/main', deps);

    expect(result).toBe('');
  });

  it('throws naming the base ref when it cannot be resolved', async ({ expect }) => {
    const base = 'origin/nope';
    const deps = depsFor({ 'rev-parse': fail('unknown revision') });

    await expect(readBaseWorkspace(base, deps)).rejects.toThrow(base);
  });

  /*
   * Folding a git failure into the empty-base answer would report every
   * catalog entry in the workspace as newly added.
   */
  it('throws rather than reporting an empty catalog when show fails', async ({ expect }) => {
    const deps = depsFor({
      'cat-file': ok(''),
      'rev-parse': ok('abc123'),
      'show': fail('corrupt object'),
    });

    await expect(readBaseWorkspace('origin/main', deps)).rejects.toThrow('corrupt object');
  });
});
