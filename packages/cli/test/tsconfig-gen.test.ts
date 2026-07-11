import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { buildInclude, resolveBuildIncludes } from '#src/lib/tsconfig-gen.js';
import { createTempDir } from './helpers.ts';

const writeConfig = (dir: string, name: string, content: string): void => {
  writeFileSync(path.join(dir, name), content);
};

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
