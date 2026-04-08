import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ProjectFixture,
  createProjectFixture,
  extendWithFixture,
} from '@gtbuchanan/test-utils';
import { describe } from 'vitest';

const createFixture = (): ProjectFixture =>
  createProjectFixture({
    packageName: '@gtbuchanan/cli',
  });

const it = extendWithFixture(createFixture);

const jsonIndent = 2;

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf-8'));

const writeJson = (dir: string, name: string, data: unknown): void => {
  const filePath = join(dir, name);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, jsonIndent)}\n`);
};

describe.concurrent('gtb CLI', () => {
  it('prints help with --help', ({ fixture, expect }) => {
    const result = fixture.run('gtb', ['--help']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain('Usage: gtb');
    expect(result.stdout).toContain('build');
    expect(result.stdout).toContain('compile');
    expect(result.stdout).toContain('lint');
  });

  it('prints help with no arguments', ({ fixture, expect }) => {
    const result = fixture.run('gtb', []);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain('Usage: gtb');
  });

  it('exits non-zero for unknown command', ({ fixture, expect }) => {
    const result = fixture.run('gtb', ['nonexistent']);

    expect(result.exitCode).not.toBe(0);
  });
});

describe('gtb prepack', () => {
  it('generates dist/source/package.json for monorepo', ({ expect }) => {
    using fixture = createFixture();
    writeFileSync(
      join(fixture.projectDir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(fixture.projectDir, 'package.json', {
      bugs: 'https://github.com/test/repo/issues',
      homepage: 'https://github.com/test/repo',
      private: true,
      repository: {
        type: 'git',
        url: 'https://github.com/test/repo.git',
      },
    });
    const pkgDir = join(fixture.projectDir, 'packages', 'my-lib');
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', {
      dependencies: { valibot: '^1.0.0' },
      devDependencies: { vitest: '^4.0.0' },
      exports: { '.': './src/index.ts' },
      name: '@test/my-lib',
      publishConfig: {
        directory: 'dist/source',
        exports: { '.': './index.js' },
      },
      scripts: { test: 'vitest' },
      version: '1.0.0',
    });

    const result = fixture.run('gtb', ['prepack']);

    expect(result).toMatchObject({ exitCode: 0 });

    const output = readJson(
      join(pkgDir, 'dist', 'source', 'package.json'),
    );

    expect(output).toHaveProperty('name', '@test/my-lib');
    expect(output).toHaveProperty('exports', { '.': './index.js' });
    expect(output).not.toHaveProperty('devDependencies');
    expect(output).not.toHaveProperty('scripts');
    expect(output).not.toHaveProperty('publishConfig');
    expect(output).toHaveProperty(
      'homepage',
      'https://github.com/test/repo/tree/main/packages/my-lib',
    );
  });

  it('works in single-package mode', ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: '@test/single',
      publishConfig: {
        directory: 'dist/source',
        exports: { '.': './index.js' },
      },
    });

    const result = fixture.run('gtb', ['prepack']);

    expect(result).toMatchObject({ exitCode: 0 });

    const output = readJson(
      join(fixture.projectDir, 'dist', 'source', 'package.json'),
    );

    expect(output).toHaveProperty('name', '@test/single');
    expect(output).toHaveProperty('exports', { '.': './index.js' });
  });
});
