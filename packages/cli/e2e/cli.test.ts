import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  JSON.parse(readFileSync(path, 'utf8'));

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
    expect(result.stdout).toContain('compile:ts');
    expect(result.stdout).toContain('typecheck:ts');
    expect(result.stdout).toContain('lint:eslint');
    expect(result.stdout).toContain('test:vitest:fast');
    expect(result.stdout).toContain('turbo:init');
    expect(result.stdout).toContain('turbo:check');
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

describe.concurrent('gtb pack:npm', () => {
  it('produces tarball for publishable package', ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: '@test/my-lib',
      publishConfig: { directory: 'dist/source' },
      version: '1.0.0',
    });

    const result = fixture.run('gtb', ['pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });

    const tarballs = readdirSync(
      join(fixture.projectDir, 'dist', 'packages', 'npm'),
    );

    expect(tarballs).toHaveLength(1);
    expect(tarballs[0]).toMatch(/^test-my-lib-.*\.tgz$/v);
  });

  it('skips private package', ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: '@test/internal',
      private: true,
      publishConfig: { directory: 'dist/source' },
      version: '1.0.0',
    });

    const result = fixture.run('gtb', ['pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(existsSync(join(fixture.projectDir, 'dist', 'packages', 'npm'))).toBe(
      false,
    );
  });

  it('skips package without publishConfig.directory', ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: '@test/my-lib',
      version: '1.0.0',
    });

    const result = fixture.run('gtb', ['pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(existsSync(join(fixture.projectDir, 'dist', 'packages', 'npm'))).toBe(
      false,
    );
  });

  it('generates dist/source manifests before packing', ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      bugs: 'https://github.com/test/repo/issues',
      dependencies: { valibot: '^1.0.0' },
      devDependencies: { vitest: '^4.0.0' },
      exports: { '.': './src/index.ts' },
      homepage: 'https://github.com/test/repo',
      name: '@test/my-lib',
      publishConfig: {
        directory: 'dist/source',
        exports: { '.': './index.js' },
      },
      repository: {
        type: 'git',
        url: 'https://github.com/test/repo.git',
      },
      scripts: { test: 'vitest' },
      version: '1.0.0',
    });

    const result = fixture.run('gtb', ['pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });

    const output = readJson(
      join(fixture.projectDir, 'dist', 'source', 'package.json'),
    );

    expect(output).toHaveProperty('name', '@test/my-lib');
    expect(output).toHaveProperty('exports', { '.': './index.js' });
    expect(output).toHaveProperty('bugs', 'https://github.com/test/repo/issues');
    expect(output).toHaveProperty(
      'homepage',
      'https://github.com/test/repo/tree/main/',
    );
    expect(output).toHaveProperty('repository', {
      directory: '',
      type: 'git',
      url: 'https://github.com/test/repo.git',
    });
    expect(output).not.toHaveProperty('devDependencies');
    expect(output).not.toHaveProperty('scripts');
    expect(output).not.toHaveProperty('publishConfig');
  });

  it('cleans dist/packages/npm before packing', ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: '@test/my-lib',
      publishConfig: { directory: 'dist/source' },
      version: '1.0.0',
    });
    const distDir = join(fixture.projectDir, 'dist', 'packages', 'npm');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'stale-0.0.0.tgz'), '');

    const result = fixture.run('gtb', ['pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });

    const tarballs = readdirSync(distDir);

    expect(tarballs).not.toContain('stale-0.0.0.tgz');
    expect(tarballs).toHaveLength(1);
  });
});
