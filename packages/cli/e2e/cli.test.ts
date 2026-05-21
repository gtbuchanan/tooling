import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type ProjectFixture,
  createProjectFixture,
  extendWithFixture,
  matchTarball,
} from '@gtbuchanan/test-utils';
import * as build from '@gtbuchanan/test-utils/builders';
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
  const filePath = path.join(dir, name);
  mkdirSync(path.join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, undefined, jsonIndent)}\n`);
};

/* eslint-disable vitest/require-hook --
   False positive with extendWithFixture indirection:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/891 */
describe.concurrent('gtb CLI', () => {
  it('prints help with --help', async ({ fixture, expect }) => {
    const result = await fixture.run('gtb', ['--help']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain('USAGE');
    expect(result.stdout).toContain('verify');
    expect(result.stdout).toContain('sync');
    expect(result.stdout).toContain('turbo');
    expect(result.stdout).toContain('task');
  });

  it('lists leaf tasks with `task --help`', async ({ fixture, expect }) => {
    const result = await fixture.run('gtb', ['task', '--help']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain('compile:ts');
    expect(result.stdout).toContain('typecheck:ts');
    expect(result.stdout).toContain('lint:eslint');
    expect(result.stdout).toContain('test:vitest:fast');
  });

  it('prints help with no arguments', async ({ fixture, expect }) => {
    const result = await fixture.run('gtb', []);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('No command specified');
  });

  it('exits non-zero for unknown command', async ({ fixture, expect }) => {
    const result = await fixture.run('gtb', ['nonexistent']);

    expect(result.exitCode).not.toBe(0);
  });
});
/* eslint-enable vitest/require-hook */

/* eslint-disable vitest/max-expects, vitest/no-standalone-expect, vitest/require-hook --
   False positive when callback omits custom fixture properties:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/891 */
describe.concurrent('gtb task pack:npm', () => {
  it('produces tarball for publishable package', async ({ expect }) => {
    using fixture = createFixture();
    const name = build.scopedPackageName();
    writeJson(fixture.projectDir, 'package.json', {
      name,
      publishConfig: { directory: build.publishDirectory() },
      version: build.semverVersion(),
    });

    const result = await fixture.run('gtb', ['task', 'pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });

    const tarballs = readdirSync(
      path.join(fixture.projectDir, 'dist', 'packages', 'npm'),
    );

    expect(tarballs).toHaveLength(1);
    expect(matchTarball(tarballs, name)).toBe(tarballs[0]);
  });

  it('skips private package', async ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: build.scopedPackageName(),
      private: true,
      publishConfig: { directory: build.publishDirectory() },
      version: build.semverVersion(),
    });

    const result = await fixture.run('gtb', ['task', 'pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(existsSync(path.join(fixture.projectDir, 'dist', 'packages', 'npm'))).toBe(
      false,
    );
  });

  it('skips package without publishConfig.directory', async ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: build.scopedPackageName(),
      version: build.semverVersion(),
    });

    const result = await fixture.run('gtb', ['task', 'pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(existsSync(path.join(fixture.projectDir, 'dist', 'packages', 'npm'))).toBe(
      false,
    );
  });

  it('generates dist/source manifests before packing', async ({ expect }) => {
    using fixture = createFixture();
    const bugs = build.gitHubIssuesUrl();
    const homepage = build.gitHubRepoUrl();
    const repository = { type: 'git', url: build.gitHubGitUrl() };
    const dependencies = build.dependencyMap();
    const name = build.scopedPackageName();
    const version = build.semverVersion();
    const publishDir = build.publishDirectory();
    const publishedExports = build.exportsMap();
    writeJson(fixture.projectDir, 'package.json', {
      bugs,
      dependencies,
      devDependencies: build.dependencyMap(),
      exports: build.exportsMap(),
      homepage,
      name,
      publishConfig: {
        directory: publishDir,
        exports: publishedExports,
      },
      repository,
      scripts: build.scriptMap(),
      version,
    });

    const result = await fixture.run('gtb', ['task', 'pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });

    const output = readJson(
      path.join(fixture.projectDir, publishDir, 'package.json'),
    );

    expect(output).toMatchObject({
      bugs,
      exports: publishedExports,
      homepage: `${homepage}/tree/main/`,
      name,
      repository: { ...repository, directory: '' },
    });
    expect(output).not.toHaveProperty('devDependencies');
    expect(output).not.toHaveProperty('scripts');
    expect(output).not.toHaveProperty('publishConfig');
  });

  it('cleans dist/packages/npm before packing', async ({ expect }) => {
    using fixture = createFixture();
    writeJson(fixture.projectDir, 'package.json', {
      name: build.scopedPackageName(),
      publishConfig: { directory: build.publishDirectory() },
      version: build.semverVersion(),
    });
    const distDir = path.join(fixture.projectDir, 'dist', 'packages', 'npm');
    mkdirSync(distDir, { recursive: true });
    const stalePath = path.join(distDir, `${build.packageName()}-0.0.0.tgz`);
    writeFileSync(stalePath, '');

    const result = await fixture.run('gtb', ['task', 'pack:npm']);

    expect(result).toMatchObject({ exitCode: 0 });

    const tarballs = readdirSync(distDir);

    expect(tarballs).not.toContain(path.basename(stalePath));
    expect(tarballs).toHaveLength(1);
  });
});
/* eslint-enable vitest/max-expects, vitest/no-standalone-expect, vitest/require-hook */
