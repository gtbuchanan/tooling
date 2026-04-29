import { describe, it } from 'vitest';
import { buildOutput, buildRepoFields } from '#src/lib/manifest.js';

describe.concurrent(buildOutput, () => {
  it('strips devDependencies and scripts', ({ expect }) => {
    const result = buildOutput({
      devDependencies: { vitest: '^4.0.0' },
      name: '@test/pkg',
      scripts: { test: 'vitest' },
    });

    expect(result).not.toHaveProperty('devDependencies');
    expect(result).not.toHaveProperty('scripts');
    expect(result).toHaveProperty('name', '@test/pkg');
  });

  it('remaps publishConfig.exports to top-level exports', ({ expect }) => {
    const result = buildOutput({
      exports: { '.': './src/index.ts' },
      publishConfig: {
        exports: { '.': './index.js' },
      },
    });

    expect(result['exports']).toStrictEqual({ '.': './index.js' });
  });

  it('remaps publishConfig.scripts to top-level scripts', ({ expect }) => {
    const result = buildOutput({
      publishConfig: {
        scripts: { postinstall: 'echo done' },
      },
      scripts: { test: 'vitest' },
    });

    expect(result.scripts).toStrictEqual({ postinstall: 'echo done' });
  });

  it('remaps publishConfig.bin to top-level bin', ({ expect }) => {
    const result = buildOutput({
      publishConfig: {
        bin: { gtb: './bin.js' },
      },
    });

    expect(result['bin']).toStrictEqual({ gtb: './bin.js' });
  });

  it('remaps publishConfig.imports to top-level imports', ({ expect }) => {
    const result = buildOutput({
      imports: { '#src/*': './src/*' },
      publishConfig: {
        imports: { '#src/*.ts': './*.js' },
      },
    });

    expect(result['imports']).toStrictEqual({ '#src/*.ts': './*.js' });
  });

  it('strips publishConfig from output', ({ expect }) => {
    const result = buildOutput({
      publishConfig: {
        directory: 'dist/source',
        exports: { '.': './index.js' },
      },
    });

    expect(result).not.toHaveProperty('publishConfig');
  });

  it('preserves other fields via looseObject passthrough', ({ expect }) => {
    const result = buildOutput({
      dependencies: { valibot: '^1.0.0' },
      name: '@test/pkg',
      version: '1.0.0',
    });

    expect(result).toHaveProperty('name', '@test/pkg');
    expect(result).toHaveProperty('version', '1.0.0');
    expect(result).toHaveProperty('dependencies');
  });
});

describe.concurrent(buildRepoFields, () => {
  it('builds all fields from root manifest', ({ expect }) => {
    const result = buildRepoFields({
      bugs: 'https://github.com/test/repo/issues',
      homepage: 'https://github.com/test/repo',
      repository: {
        type: 'git',
        url: 'https://github.com/test/repo.git',
      },
    }, 'packages/foo');

    expect(result).toStrictEqual({
      bugs: 'https://github.com/test/repo/issues',
      homepage: 'https://github.com/test/repo/tree/main/packages/foo',
      repository: {
        directory: 'packages/foo',
        type: 'git',
        url: 'https://github.com/test/repo.git',
      },
    });
  });

  it('returns empty object when root has no fields', ({ expect }) => {
    expect(buildRepoFields({}, 'packages/foo')).toStrictEqual({});
  });

  it('includes only fields present in root', ({ expect }) => {
    const result = buildRepoFields({
      homepage: 'https://github.com/test/repo',
    }, 'packages/bar');

    expect(result).toStrictEqual({
      homepage: 'https://github.com/test/repo/tree/main/packages/bar',
    });
  });
});
