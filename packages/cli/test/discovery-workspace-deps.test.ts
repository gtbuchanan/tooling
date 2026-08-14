import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverPackage } from '#src/lib/discovery.js';
import { localeComparer } from '#src/lib/sort.js';
import { createTempDir, writeJson } from './helpers.ts';

describe.concurrent('workspace dependency discovery', () => {
  it('collects runtime workspace dependency names', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', { dependencies: { [dep]: 'workspace:*' } });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([dep]);
  });

  it('collects workspace peer and optional dependencies', ({ expect }) => {
    const dir = createTempDir();
    const optional = build.scopedPackageName();
    const peer = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      optionalDependencies: { [optional]: 'workspace:^' },
      peerDependencies: { [peer]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies)
      .toStrictEqual([optional, peer].toSorted(localeComparer));
  });

  it('deduplicates a name declared in more than one runtime field', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      dependencies: { [dep]: 'workspace:*' },
      peerDependencies: { [dep]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([dep]);
  });

  it('excludes devDependencies from workspace dependencies', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { [build.scopedPackageName()]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([]);
  });

  it('excludes a workspace dependency the tarball bundles', ({ expect }) => {
    const dir = createTempDir();
    const bundled = build.scopedPackageName();
    const external = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundleDependencies: [bundled],
      dependencies: { [bundled]: 'workspace:*', [external]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([external]);
  });

  it('excludes every runtime dependency when bundleDependencies is true', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      bundleDependencies: true,
      dependencies: { [build.scopedPackageName()]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([]);
  });

  it('honors the bundledDependencies alias', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundledDependencies: [dep],
      dependencies: { [dep]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([]);
  });

  it('excludes registry-versioned runtime dependencies', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      dependencies: { [build.scopedPackageName()]: build.semverRange() },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([]);
  });
});
