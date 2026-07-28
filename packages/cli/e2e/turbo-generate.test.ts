import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type ProjectFixture, createProjectFixture } from '@gtbuchanan/test-utils';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';

/*
 * These tests drive the real turbo binary over a workspace `gtb sync`
 * generated, because the failure they guard against is invisible to a
 * turbo.json snapshot: turbo aborts the whole run when a task in `dependsOn`
 * resolves to no definition, and silently restores nothing when a cached
 * task declares no outputs. `gtb turbo` is used rather than turbo directly
 * so the Android/Termux escape hatch applies.
 */

const jsonIndent = 2;

const stampScript = (file: string): string =>
  `node -e "require('fs').mkdirSync('generated',{recursive:true});` +
  `require('fs').writeFileSync('generated/${file}','stamped')"`;

const writeJson = (dir: string, name: string, data: unknown): void => {
  const filePath = path.join(dir, name);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, undefined, jsonIndent)}\n`);
};

const createFixture = (): ProjectFixture =>
  createProjectFixture({ packageName: '@gtbuchanan/cli' });

/* eslint-disable vitest/max-expects --
   Each step of a turbo run is its own observable outcome: the command
   succeeded, the cache behaved as configured, the file landed */
describe.concurrent('generate tasks through turbo', () => {
  it('runs a single-package generate script on every invocation', async ({ expect }) => {
    using fixture = createFixture();
    const stamp = `${build.packageName()}.txt`;
    writeJson(fixture.projectDir, 'package.json', {
      name: build.packageName(),
      packageManager: 'npm@11.0.0',
      scripts: { 'generate:stamp': stampScript(stamp) },
      version: build.semverVersion(),
    });

    const sync = await fixture.run('gtb', ['sync', 'turbo']);

    expect(sync).toMatchObject({ exitCode: 0 });

    const generated = path.join(fixture.projectDir, 'generated', stamp);
    const first = await fixture.run('gtb', ['turbo', 'run', 'generate']);

    expect(first).toMatchObject({ exitCode: 0 });
    expect(existsSync(generated)).toBe(true);

    /*
     * sync marks single-package leaves `cache: false`, so turbo must bypass
     * the cache rather than decide between a hit and a miss — the file being
     * regenerated is not enough on its own, since a generated file that turbo
     * counts among the task's default inputs invalidates the hash by going
     * missing and would re-run either way.
     */
    rmSync(generated);

    const second = await fixture.run('gtb', ['turbo', 'run', 'generate']);

    expect(second).toMatchObject({ exitCode: 0 });
    expect(second.stdout).toContain('cache bypass');
    expect(existsSync(generated)).toBe(true);
  });

  it('restores package-declared generate outputs from cache', async ({ expect }) => {
    using fixture = createFixture();
    const workspace = path.join(fixture.projectDir, 'workspace');
    const pkgDir = path.join(workspace, 'packages', build.packageName());
    const stamp = `${build.packageName()}.txt`;
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(workspace, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(workspace, 'package.json', {
      name: build.packageName(),
      packageManager: 'npm@11.0.0',
      private: true,
      version: build.semverVersion(),
      workspaces: ['packages/*'],
    });
    /*
     * turbo builds its package graph from the lockfile. npm never ran in
     * this nested workspace, so declare the one package by hand.
     */
    const pkgName = build.packageName();
    writeJson(workspace, 'package-lock.json', {
      lockfileVersion: 3,
      packages: {
        '': { workspaces: ['packages/*'] },
        [`node_modules/${pkgName}`]: { link: true, resolved: path.relative(workspace, pkgDir) },
        [path.relative(workspace, pkgDir)]: { name: pkgName, version: '0.0.0' },
      },
      requires: true,
    });
    writeJson(pkgDir, 'package.json', {
      name: pkgName,
      scripts: { 'generate:stamp': stampScript(stamp) },
      version: '0.0.0',
    });

    const sync = await fixture.run('gtb', ['sync', '-C', workspace, 'turbo']);

    expect(sync).toMatchObject({ exitCode: 0 });

    const rootTasks: unknown = JSON.parse(
      readFileSync(path.join(workspace, 'turbo.json'), 'utf8'),
    );

    expect(rootTasks).toHaveProperty('tasks.generate');
    expect(rootTasks).not.toHaveProperty('tasks.generate.dependsOn');
    expect(rootTasks).not.toHaveProperty('tasks.generate:stamp');

    const verify = await fixture.run('gtb', ['verify', '-C', workspace, 'turbo']);

    expect(verify).toMatchObject({ exitCode: 1 });
    expect(verify.stderr).toContain('add a package configuration');

    writeJson(pkgDir, 'turbo.json', {
      extends: ['//'],
      tasks: {
        'generate': { dependsOn: ['generate:stamp'] },
        'generate:stamp': { outputs: ['generated/**'] },
      },
    });

    const verified = await fixture.run('gtb', ['verify', '-C', workspace, 'turbo']);

    expect(verified).toMatchObject({ exitCode: 0 });

    const generated = path.join(pkgDir, 'generated', stamp);
    const first = await fixture.run('gtb', ['turbo', '--cwd', workspace, 'run', 'generate']);

    expect(first).toMatchObject({ exitCode: 0 });
    expect(existsSync(generated)).toBe(true);

    /*
     * The declared outputs are what make a cache hit safe: with them, the
     * generated file comes back without running the script.
     */
    rmSync(generated);

    const second = await fixture.run('gtb', ['turbo', '--cwd', workspace, 'run', 'generate']);

    expect(second).toMatchObject({ exitCode: 0 });
    expect(second.stdout).toContain('cache hit');
    expect(existsSync(generated)).toBe(true);
  });
});
/* eslint-enable vitest/max-expects */
