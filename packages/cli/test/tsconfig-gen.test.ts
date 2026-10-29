import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { buildInclude, typeCheckInclude } from '#src/lib/layout.js';
import type { GeneratedTsconfig, TsconfigDescriptor } from '#src/lib/tsconfig-gen.js';
import {
  defaultTsconfigVariant,
  generateTsconfigBase,
  planTsconfigs,
} from '#src/lib/tsconfig-gen.js';
import { makeCapabilities } from './turbo-config.helpers.ts';

const descriptorAt = (
  descriptors: readonly TsconfigDescriptor[],
  filePath: string,
): TsconfigDescriptor | undefined =>
  descriptors.find(descriptor => descriptor.path === filePath);

const generateAt = (
  descriptors: readonly TsconfigDescriptor[],
  filePath: string,
): GeneratedTsconfig | undefined => descriptorAt(descriptors, filePath)?.generate();

describe.concurrent(generateTsconfigBase, () => {
  it('extends the node variant by default', ({ expect }) => {
    expect(generateTsconfigBase()).toStrictEqual({
      extends: ['@gtbuchanan/tsconfig/node.json'],
    });
  });

  it('extends the given variant', ({ expect }) => {
    const variant = build.packageName();

    expect(generateTsconfigBase(variant)).toStrictEqual({
      extends: [`@gtbuchanan/tsconfig/${variant}.json`],
    });
  });

  it('defaults to the node variant', ({ expect }) => {
    expect(defaultTsconfigVariant).toBe('node');
  });
});

describe.concurrent(planTsconfigs, () => {
  it('points a package at the root configs from its own depth', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());
    const pkgDir = path.join(rootDir, 'packages', build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: pkgDir, hasTypeScript: true, isPublished: true }),
    ]);

    expect(generateAt(descriptors, path.join(pkgDir, 'tsconfig.json')))
      .toHaveProperty('extends', '../../tsconfig.base.json');
    expect(generateAt(descriptors, path.join(pkgDir, 'tsconfig.build.json')))
      .toHaveProperty('extends', '../../tsconfig.build.json');
  });

  it('derives the extends depth rather than assuming packages/<name>', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());
    const pkgDir = path.join(rootDir, build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: pkgDir, hasTypeScript: true }),
    ]);

    expect(generateAt(descriptors, path.join(pkgDir, 'tsconfig.json')))
      .toHaveProperty('extends', '../tsconfig.base.json');
  });

  it('omits the build descriptor for an unpublished package', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());
    const pkgDir = path.join(rootDir, 'packages', build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: pkgDir, hasTypeScript: true }),
    ]);

    expect(descriptorAt(descriptors, path.join(pkgDir, 'tsconfig.build.json')))
      .toBeUndefined();
  });

  it('emits one descriptor per file when the root is the package', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: rootDir, hasTypeScript: true, isPublished: true }),
    ]);

    expect(descriptors.map(descriptor => descriptor.path)).toStrictEqual([
      path.join(rootDir, 'tsconfig.json'),
      path.join(rootDir, 'tsconfig.build.json'),
    ]);
  });

  it('keeps the collapsed root tsconfig.json extending the local base', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: rootDir, hasTypeScript: true, isPublished: true }),
    ]);

    expect(generateAt(descriptors, path.join(rootDir, 'tsconfig.json'))).toStrictEqual({
      compilerOptions: { noEmit: true },
      extends: './tsconfig.base.json',
      include: [...typeCheckInclude],
    });
  });

  it('folds the package build layer into the root tsconfig.build.json', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: rootDir, hasTypeScript: true, isPublished: true }),
    ]);

    /*
     * The package layer would extend `./tsconfig.build.json` — itself — so the
     * collapsed descriptor keeps the root layer's base extends and takes only
     * the package layer's compilerOptions and include.
     */
    expect(generateAt(descriptors, path.join(rootDir, 'tsconfig.build.json'))).toStrictEqual({
      compilerOptions: {
        declaration: true, outDir: 'dist/source', rootDir: '.', sourceMap: true,
      },
      extends: './tsconfig.base.json',
      include: [...buildInclude],
    });
  });

  it('owns both layers compilerOptions on the collapsed build config', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: rootDir, hasTypeScript: true, isPublished: true }),
    ]);
    const descriptor = descriptorAt(descriptors, path.join(rootDir, 'tsconfig.build.json'));

    // Both layers' keys are owned, so verify checks the whole collapsed set.
    expect(descriptor?.ownedKeys).toStrictEqual({
      declaration: true, outDir: 'dist/source', rootDir: '.', sourceMap: true,
    });
  });

  it('leaves the root build config bare when the root package is unpublished', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: rootDir, hasTypeScript: true }),
    ]);

    expect(generateAt(descriptors, path.join(rootDir, 'tsconfig.build.json'))).toStrictEqual({
      compilerOptions: { declaration: true, sourceMap: true },
      extends: './tsconfig.base.json',
    });
  });

  it('preserves user compilerOptions under the collapsed generated keys', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());
    const userKey = build.packageName();

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: rootDir, hasTypeScript: true, isPublished: true }),
    ]);
    const generated = descriptorAt(descriptors, path.join(rootDir, 'tsconfig.build.json'))
      ?.generate({ [userKey]: true, outDir: 'stale' });

    expect(generated).toHaveProperty(['compilerOptions', userKey], true);
    expect(generated).toHaveProperty(['compilerOptions', 'outDir'], 'dist/source');
  });

  it('overrides user values for keys owned by either collapsed layer', ({ expect }) => {
    const rootDir = path.resolve(build.packageName());

    const descriptors = planTsconfigs(rootDir, [
      makeCapabilities({ dir: rootDir, hasTypeScript: true, isPublished: true }),
    ]);

    /*
     * `declaration`/`sourceMap` belong to the root layer only, so the package
     * layer's own user merge would otherwise hand them back to the user.
     */
    expect(descriptorAt(descriptors, path.join(rootDir, 'tsconfig.build.json'))
      ?.generate({ declaration: false, rootDir: 'stale', sourceMap: false }))
      .toHaveProperty('compilerOptions', {
        declaration: true, outDir: 'dist/source', rootDir: '.', sourceMap: true,
      });
  });
});
