import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { GeneratedTsconfig, TsconfigDescriptor } from '#src/lib/tsconfig-gen.js';
import {
  buildInclude, planTsconfigs, resolveBuildIncludes, typeCheckInclude,
} from '#src/lib/tsconfig-gen.js';
import { createTempDir } from './helpers.ts';
import { makeCapabilities } from './turbo-config.helpers.ts';

const writeConfig = (dir: string, name: string, content: string): void => {
  writeFileSync(path.join(dir, name), content);
};

const descriptorAt = (
  descriptors: readonly TsconfigDescriptor[],
  filePath: string,
): TsconfigDescriptor | undefined =>
  descriptors.find(descriptor => descriptor.path === filePath);

const generateAt = (
  descriptors: readonly TsconfigDescriptor[],
  filePath: string,
): GeneratedTsconfig | undefined => descriptorAt(descriptors, filePath)?.generate();

describe.concurrent(resolveBuildIncludes, () => {
  it('reads the explicit include array from tsconfig.build.json', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(
      dir, 'tsconfig.build.json', JSON.stringify({ include: ['bin', 'src', 'generated'] }),
    );

    expect(resolveBuildIncludes(dir)).toStrictEqual(['bin', 'src', 'generated']);
  });

  it('preserves glob patterns verbatim rather than expanding to files', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(dir, 'tsconfig.build.json', JSON.stringify({ include: ['src', '*.proto.ts'] }));

    expect(resolveBuildIncludes(dir)).toStrictEqual(['src', '*.proto.ts']);
  });

  it('tolerates comments and trailing commas (JSONC)', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(dir, 'tsconfig.build.json', [
      '{',
      '  // build inputs',
      '  "include": ["bin", "src",], /* trailing comma */',
      '}',
    ].join('\n'));

    expect(resolveBuildIncludes(dir)).toStrictEqual(['bin', 'src']);
  });

  it('follows relative extends when the child omits include', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(dir, 'base.json', JSON.stringify({ include: ['lib'] }));
    writeConfig(dir, 'tsconfig.build.json', JSON.stringify({ extends: './base.json' }));

    expect(resolveBuildIncludes(dir)).toStrictEqual(['lib']);
  });

  it('resolves an extends target that omits the .json extension', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(dir, 'base.json', JSON.stringify({ include: ['lib'] }));
    writeConfig(dir, 'tsconfig.build.json', JSON.stringify({ extends: './base' }));

    expect(resolveBuildIncludes(dir)).toStrictEqual(['lib']);
  });

  it('follows a multi-level extends chain to an inherited include', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(dir, 'grandparent.json', JSON.stringify({ include: ['lib'] }));
    writeConfig(dir, 'parent.json', JSON.stringify({ extends: './grandparent.json' }));
    writeConfig(dir, 'tsconfig.build.json', JSON.stringify({ extends: './parent.json' }));

    expect(resolveBuildIncludes(dir)).toStrictEqual(['lib']);
  });

  it('lets the nearest include win over an extended one', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(dir, 'base.json', JSON.stringify({ include: ['lib'] }));
    writeConfig(
      dir, 'tsconfig.build.json', JSON.stringify({ extends: './base.json', include: ['src'] }),
    );

    expect(resolveBuildIncludes(dir)).toStrictEqual(['src']);
  });

  it('falls back to buildInclude when the file is missing', ({ expect }) => {
    const dir = createTempDir();

    expect(resolveBuildIncludes(dir)).toStrictEqual([...buildInclude]);
  });

  it('resolves an extends that points to a node_modules package (via exports)', ({ expect }) => {
    const dir = createTempDir();
    const pkgDir = path.join(dir, 'node_modules', '@acme', 'base');
    mkdirSync(pkgDir, { recursive: true });
    writeConfig(pkgDir, 'package.json', JSON.stringify({
      name: '@acme/base', version: '1.0.0', exports: { './build': './tsconfig.build.json' },
    }));
    writeConfig(pkgDir, 'tsconfig.build.json', JSON.stringify({ include: ['src', '*.proto.ts'] }));
    writeConfig(dir, 'tsconfig.build.json', JSON.stringify({ extends: '@acme/base/build' }));

    // An inherited include is rebased to the extended config's location (tsc semantics).
    expect(resolveBuildIncludes(dir)).toStrictEqual([
      'node_modules/@acme/base/src', 'node_modules/@acme/base/*.proto.ts',
    ]);
  });

  it('falls back to buildInclude when an extends package cannot be resolved', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(
      dir, 'tsconfig.build.json', JSON.stringify({ extends: '@nonexistent/tsconfig-xyz' }),
    );

    expect(resolveBuildIncludes(dir)).toStrictEqual([...buildInclude]);
  });

  it('falls back to buildInclude on malformed content', ({ expect }) => {
    const dir = createTempDir();
    writeConfig(dir, 'tsconfig.build.json', '{ this is not json');

    expect(resolveBuildIncludes(dir)).toStrictEqual([...buildInclude]);
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
