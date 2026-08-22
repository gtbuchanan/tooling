import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverPackage } from '#src/core/discovery.js';
import type { Manifest } from '#src/core/manifest.js';
import { localeComparer } from '#src/core/sort.js';
import { capabilities } from '#src/toolchains/index.js';
import { catalogDependenciesOf, workspaceDependenciesOf } from '#src/toolchains/npm/manifest.js';
import { createTempDir, writeJson } from '#test/helpers.js';

describe.concurrent(workspaceDependenciesOf, () => {
  it('collects runtime workspace dependency names', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', { dependencies: { [dep]: 'workspace:*' } });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([dep]);
  });

  it('collects workspace peer and optional dependencies', ({ expect }) => {
    const dir = createTempDir();
    const optional = build.scopedPackageName();
    const peer = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      optionalDependencies: { [optional]: 'workspace:^' },
      peerDependencies: { [peer]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result))
      .toStrictEqual([optional, peer].toSorted(localeComparer));
  });

  it('deduplicates a name declared in more than one runtime field', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      dependencies: { [dep]: 'workspace:*' },
      peerDependencies: { [dep]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([dep]);
  });

  it('excludes devDependencies from workspace dependencies', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { [build.scopedPackageName()]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([]);
  });

  it('excludes a workspace dependency the tarball bundles', ({ expect }) => {
    const dir = createTempDir();
    const bundled = build.scopedPackageName();
    const external = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundleDependencies: [bundled],
      dependencies: { [bundled]: 'workspace:*', [external]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([external]);
  });

  it('excludes a bundled workspace peer named explicitly', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundleDependencies: [dep],
      peerDependencies: { [dep]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([]);
  });

  it('excludes the dependencies field when bundleDependencies is true', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      bundleDependencies: true,
      dependencies: { [build.scopedPackageName()]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([]);
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

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([peer]);
  });

  it('does not exempt an optional dependency when bundleDependencies is true', ({ expect }) => {
    const dir = createTempDir();
    const optional = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundleDependencies: true,
      optionalDependencies: { [optional]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([optional]);
  });

  it('honors the bundledDependencies alias', ({ expect }) => {
    const dir = createTempDir();
    const dep = build.scopedPackageName();
    writeJson(dir, 'package.json', {
      bundledDependencies: [dep],
      dependencies: { [dep]: 'workspace:*' },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([]);
  });

  it('excludes registry-versioned runtime dependencies', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      dependencies: { [build.scopedPackageName()]: build.semverRange() },
    });

    const result = discoverPackage(dir, capabilities);

    expect(workspaceDependenciesOf(result)).toStrictEqual([]);
  });
});

const catalogDependenciesOfManifest = (manifest: Manifest) => catalogDependenciesOf({ manifest });

describe.concurrent(catalogDependenciesOf, () => {
  it('collects a catalog-backed runtime dependency', ({ expect }) => {
    const name = build.packageName();

    const result = catalogDependenciesOfManifest({ dependencies: { [name]: 'catalog:' } });

    expect(result).toStrictEqual([{ catalog: 'default', name }]);
  });

  it('resolves an explicitly named catalog specifier', ({ expect }) => {
    const name = build.packageName();

    const result = catalogDependenciesOfManifest({
      dependencies: { [name]: 'catalog:legacy' },
    });

    expect(result).toStrictEqual([{ catalog: 'legacy', name }]);
  });

  it('collects peerDependencies and optionalDependencies', ({ expect }) => {
    const peer = build.packageName();
    const optional = build.packageName();

    const result = catalogDependenciesOfManifest({
      optionalDependencies: { [optional]: 'catalog:' },
      peerDependencies: { [peer]: 'catalog:' },
    });

    expect(result).toContainEqual({ catalog: 'default', name: peer });
    expect(result).toContainEqual({ catalog: 'default', name: optional });
  });

  // Publishing strips devDependencies, so they never reach a consumer.
  it('excludes devDependencies', ({ expect }) => {
    const name = build.packageName();

    const result = catalogDependenciesOfManifest({
      devDependencies: { [name]: 'catalog:' },
    });

    expect(result).toStrictEqual([]);
  });

  it('excludes a dependency the tarball bundles', ({ expect }) => {
    const name = build.packageName();

    const result = catalogDependenciesOfManifest({
      bundleDependencies: [name],
      dependencies: { [name]: 'catalog:' },
    });

    expect(result).toStrictEqual([]);
  });

  it('ignores a specifier that is not catalog-backed', ({ expect }) => {
    const name = build.packageName();

    const result = catalogDependenciesOfManifest({
      dependencies: { [name]: build.semverRange() },
    });

    expect(result).toStrictEqual([]);
  });
});
