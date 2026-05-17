import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { prepack } from '#src/commands/task/pack-npm.js';
import { createTempDir } from './helpers.ts';

const jsonIndent = 2;

/** Writes formatted JSON (matches prepack output for assertion). */
const writeFormattedJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(
    path.join(dir, name),
    `${JSON.stringify(data, undefined, jsonIndent)}\n`,
  );
};

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'));

describe.concurrent(prepack, () => {
  it('generates dist/source/package.json for publishable package', ({ expect }) => {
    const root = createTempDir();
    const bugs = build.gitHubIssuesUrl();
    const homepage = build.gitHubRepoUrl();
    const repository = { type: 'git', url: build.gitHubGitUrl() };
    const dependencies = build.dependencyMap();
    const name = build.scopedPackageName();
    const version = build.semverVersion();
    const publishDir = build.publishDirectory();
    const publishedExports = build.exportsMap();
    const pkgBasename = build.packageName();
    const pkgDirRelative = `packages/${pkgBasename}`;

    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', { bugs, homepage, repository });
    const pkgDir = path.join(root, pkgDirRelative);
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      dependencies,
      devDependencies: build.dependencyMap(),
      exports: build.exportsMap(),
      name,
      publishConfig: {
        directory: publishDir,
        exports: publishedExports,
      },
      scripts: build.scriptMap(),
      version,
    });

    prepack({ cwd: root });
    const output = readJson(path.join(pkgDir, publishDir, 'package.json'));

    expect(output).toMatchObject({
      dependencies,
      exports: publishedExports,
      homepage: `${homepage}/tree/main/${pkgDirRelative}`,
      name,
      repository: { ...repository, directory: pkgDirRelative },
      version,
    });
    expect(output).not.toHaveProperty('devDependencies');
    expect(output).not.toHaveProperty('scripts');
    expect(output).not.toHaveProperty('publishConfig');
  });

  it('generates .npmignore', ({ expect }) => {
    const root = createTempDir();
    const name = build.scopedPackageName();
    const publishDir = build.publishDirectory();
    const pkgBasename = build.packageName();

    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', pkgBasename);
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      name,
      publishConfig: { directory: publishDir },
    });

    prepack({ cwd: root });

    const npmignore = readFileSync(
      path.join(pkgDir, publishDir, '.npmignore'),
      'utf8',
    );

    expect(npmignore).toBe('*.tsbuildinfo\n');
  });

  it('promotes publishConfig.bin', ({ expect }) => {
    const root = createTempDir();
    const name = build.scopedPackageName();
    const publishDir = build.publishDirectory();
    const pkgBasename = build.packageName();
    const publishedBin = build.binMap();

    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', pkgBasename);
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      bin: build.binMap(),
      name,
      publishConfig: {
        bin: publishedBin,
        directory: publishDir,
      },
    });

    prepack({ cwd: root });
    const output = readJson(path.join(pkgDir, publishDir, 'package.json'));

    expect(output).toHaveProperty('bin', publishedBin);
  });

  it('skips private packages', ({ expect }) => {
    const root = createTempDir();
    const name = build.scopedPackageName();
    const publishDir = build.publishDirectory();
    const pkgBasename = build.packageName();

    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', pkgBasename);
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', {
      name,
      private: true,
      publishConfig: { directory: publishDir },
    });

    prepack({ cwd: root });

    expect(() =>
      readFileSync(path.join(pkgDir, publishDir, 'package.json')),
    ).toThrow(/ENOENT/v);
  });

  it('skips packages without publishConfig.directory', ({ expect }) => {
    const root = createTempDir();
    const name = build.scopedPackageName();
    const pkgBasename = build.packageName();

    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeFormattedJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', pkgBasename);
    mkdirSync(pkgDir, { recursive: true });
    writeFormattedJson(pkgDir, 'package.json', { name });

    prepack({ cwd: root });

    expect(() =>
      readFileSync(path.join(pkgDir, 'dist', 'source', 'package.json')),
    ).toThrow(/ENOENT/v);
  });

  it('works in single-package mode', ({ expect }) => {
    const root = createTempDir();
    const name = build.scopedPackageName();
    const publishDir = build.publishDirectory();
    const publishedExports = build.exportsMap();

    writeFormattedJson(root, 'package.json', {
      name,
      publishConfig: {
        directory: publishDir,
        exports: publishedExports,
      },
    });

    prepack({ cwd: root });

    const output = readJson(path.join(root, publishDir, 'package.json'));

    expect(output).toHaveProperty('name', name);
    expect(output).toHaveProperty('exports', publishedExports);
  });
});
