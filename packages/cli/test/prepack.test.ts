import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { prepack } from '#src/commands/pack.js';
import { createTempDir } from './helpers.ts';

const jsonIndent = 2;

/** Writes formatted JSON (matches prepack output for assertion). */
const writeFormattedJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(
    path.join(dir, name),
    `${JSON.stringify(data, null, jsonIndent)}\n`,
  );
};

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'));

describe(prepack, () => {
  it('generates dist/source/package.json for publishable package', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {
      bugs: 'https://github.com/test/repo/issues',
      homepage: 'https://github.com/test/repo',
      repository: {
        type: 'git',
        url: 'https://github.com/test/repo.git',
      },
    });
    const pkgDir = path.join(root, 'packages', 'my-lib');
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
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

    prepack({ cwd: root });
    const output = readJson(
      path.join(pkgDir, 'dist', 'source', 'package.json'),
    );

    expect(output).toHaveProperty('name', '@test/my-lib');
    expect(output).toHaveProperty('version', '1.0.0');
    expect(output).toHaveProperty('exports', { '.': './index.js' });
    expect(output).toHaveProperty('dependencies', { valibot: '^1.0.0' });
    expect(output).not.toHaveProperty('devDependencies');
    expect(output).not.toHaveProperty('scripts');
    expect(output).not.toHaveProperty('publishConfig');
    expect(output).toHaveProperty(
      'homepage',
      'https://github.com/test/repo/tree/main/packages/my-lib',
    );
    expect(output).toHaveProperty('repository', {
      directory: 'packages/my-lib',
      type: 'git',
      url: 'https://github.com/test/repo.git',
    });
  });

  it('generates .npmignore', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', 'my-lib');
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      name: '@test/my-lib',
      publishConfig: { directory: 'dist/source' },
    });

    prepack({ cwd: root });

    const npmignore = readFileSync(
      path.join(pkgDir, 'dist', 'source', '.npmignore'),
      'utf8',
    );

    expect(npmignore).toBe('*.tsbuildinfo\n');
  });

  it('promotes publishConfig.bin', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', 'cli');
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      bin: { mycli: './dist/source/bin.js' },
      name: '@test/cli',
      publishConfig: {
        bin: { mycli: './bin.js' },
        directory: 'dist/source',
      },
    });

    prepack({ cwd: root });
    const output = readJson(
      path.join(pkgDir, 'dist', 'source', 'package.json'),
    );

    expect(output).toHaveProperty('bin', { mycli: './bin.js' });
  });

  it('skips private packages', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', 'internal');
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      name: '@test/internal',
      private: true,
      publishConfig: { directory: 'dist/source' },
    });

    prepack({ cwd: root });

    expect(() =>
      readFileSync(path.join(pkgDir, 'dist', 'source', 'package.json')),
    ).toThrow();
  });

  it('skips packages without publishConfig.directory', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', 'no-publish');
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      name: '@test/no-publish',
    });

    prepack({ cwd: root });

    expect(() =>
      readFileSync(path.join(pkgDir, 'dist', 'source', 'package.json')),
    ).toThrow();
  });

  it('works in single-package mode', ({ expect }) => {
    const root = createTempDir();
    writeFormattedJson(root, 'package.json', {
      name: '@test/single',
      publishConfig: {
        directory: 'dist/source',
        exports: { '.': './index.js' },
      },
    });

    prepack({ cwd: root });

    const output = readJson(
      path.join(root, 'dist', 'source', 'package.json'),
    );

    expect(output).toHaveProperty('name', '@test/single');
    expect(output).toHaveProperty('exports', { '.': './index.js' });
  });
});
