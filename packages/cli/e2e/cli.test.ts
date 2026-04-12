import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
    expect(result.stdout).toContain('compile:ts');
    expect(result.stdout).toContain('typecheck:ts');
    expect(result.stdout).toContain('lint:eslint');
    expect(result.stdout).toContain('lint:oxlint');
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

describe('gtb pack', () => {
  it('produces tarballs for publishable packages', ({ expect }) => {
    using fixture = createFixture();
    writeFileSync(
      join(fixture.projectDir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(fixture.projectDir, 'package.json', {
      private: true,
    });
    const pkgDir = join(fixture.projectDir, 'packages', 'my-lib');
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', {
      name: '@test/my-lib',
      version: '1.0.0',
    });

    const result = fixture.run('gtb', ['pack']);

    expect(result).toMatchObject({ exitCode: 0 });

    const tarballs = readdirSync(
      join(fixture.projectDir, 'dist', 'packages'),
    );

    expect(tarballs).toHaveLength(1);
    expect(tarballs[0]).toMatch(/^test-my-lib-.*\.tgz$/v);
  });

  it('skips private packages', ({ expect }) => {
    using fixture = createFixture();
    writeFileSync(
      join(fixture.projectDir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(fixture.projectDir, 'package.json', {
      private: true,
    });
    const publicDir = join(fixture.projectDir, 'packages', 'public-lib');
    mkdirSync(publicDir, { recursive: true });
    writeJson(publicDir, 'package.json', {
      name: '@test/public-lib',
      version: '1.0.0',
    });
    const privateDir = join(fixture.projectDir, 'packages', 'internal');
    mkdirSync(privateDir, { recursive: true });
    writeJson(privateDir, 'package.json', {
      name: '@test/internal',
      private: true,
      version: '1.0.0',
    });

    const result = fixture.run('gtb', ['pack']);

    expect(result).toMatchObject({ exitCode: 0 });

    const tarballs = readdirSync(
      join(fixture.projectDir, 'dist', 'packages'),
    );

    expect(tarballs).toHaveLength(1);
    expect(tarballs[0]).toMatch(/^test-public-lib-.*\.tgz$/v);
  });

  it('generates dist/source manifests before packing', ({ expect }) => {
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

    const result = fixture.run('gtb', ['pack']);

    expect(result).toMatchObject({ exitCode: 0 });

    const output = readJson(
      join(pkgDir, 'dist', 'source', 'package.json'),
    );

    expect(output).toHaveProperty('name', '@test/my-lib');
    expect(output).toHaveProperty('exports', { '.': './index.js' });
    expect(output).not.toHaveProperty('devDependencies');
    expect(output).not.toHaveProperty('scripts');
    expect(output).not.toHaveProperty('publishConfig');
  });

  it('cleans dist/packages before packing', ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: '@test/my-lib',
      version: '1.0.0',
    });
    const distDir = join(fixture.projectDir, 'dist', 'packages');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'stale-0.0.0.tgz'), '');

    const result = fixture.run('gtb', ['pack']);

    expect(result).toMatchObject({ exitCode: 0 });

    const tarballs = readdirSync(distDir);

    expect(tarballs).not.toContain('stale-0.0.0.tgz');
    expect(tarballs).toHaveLength(1);
  });
});
