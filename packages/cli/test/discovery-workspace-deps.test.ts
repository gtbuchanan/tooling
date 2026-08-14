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

  it('excludes a bundled workspace peer named explicitly', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundleDependencies: [dep],
      peerDependencies: { [dep]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([]);
  });

  it('excludes the dependencies field when bundleDependencies is true', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      bundleDependencies: true,
      dependencies: { [build.scopedPackageName()]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([]);
  });

  /*
   * `bundleDependencies: true` covers the `dependencies` field only. Measured
   * against `pnpm pack`: a workspace peer or optional dependency keeps its
   * rewritten specifier but is absent from the tarball, so exempting it would
   * hide the exact breakage this check exists to catch.
   */
  it('does not exempt a workspace peer when bundleDependencies is true', ({ expect }) => {
    const dir = createTempDir();
    const peer = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundleDependencies: true,
      peerDependencies: { [peer]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([peer]);
  });

  it('does not exempt an optional dependency when bundleDependencies is true', ({ expect }) => {
    const dir = createTempDir();
    const optional = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundleDependencies: true,
      optionalDependencies: { [optional]: 'workspace:*' },
    });

    const result = discoverPackage(dir);

    expect(result.workspaceDependencies).toStrictEqual([optional]);
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
