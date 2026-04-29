import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';
import { parseIgnoreArgs, verify } from '#src/commands/root/verify.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { writeJsonFile } from '#src/lib/file-writer.js';
import {
  generatePackageScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';
import {
  createTempDir, initProject, readScripts, readTurboTasks, writeJson,
} from './helpers.ts';

const runVerify = async (
  dir: string,
  args: readonly string[],
): Promise<typeof process.exitCode> => {
  const origCwd = process.cwd();
  const origExitCode = process.exitCode;
  vi.spyOn(console, 'log').mockReturnValue();
  vi.spyOn(console, 'error').mockReturnValue();

  try {
    process.chdir(dir);
    await runCommand(verify, { rawArgs: [...args] });
    return process.exitCode;
  } finally {
    process.chdir(origCwd);
    process.exitCode = origExitCode;
  }
};

const createConsumerProject = (): string => {
  const root = createTempDir();
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  writeJson(root, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
      '@gtbuchanan/vitest-config': '^0.1.0',
    },
    name: 'test-project',
    private: true,
    scripts: {},
  });

  const pkg = path.join(root, 'packages', 'app');
  mkdirSync(path.join(pkg, 'src'), { recursive: true });
  mkdirSync(path.join(pkg, 'test'), { recursive: true });
  writeJson(pkg, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
      '@gtbuchanan/vitest-config': '^0.1.0',
    },
    name: '@test/app',
    scripts: {},
  });
  writeFileSync(path.join(pkg, 'tsconfig.json'), '{}');
  writeFileSync(path.join(pkg, 'eslint.config.ts'), '');
  writeFileSync(path.join(pkg, 'vitest.config.ts'), '');

  return root;
};

describe.concurrent('verify drift detection', () => {
  it('all expected tasks present after init', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const discovery = discoverWorkspace({ cwd: root });
    const expected = generateTurboJson(discovery);
    const actual = readTurboTasks(root);

    for (const name of Object.keys(expected.tasks)) {
      expect(actual).toHaveProperty(name);
    }
  });

  it('detects missing turbo.json task', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });

    const discovery = discoverWorkspace({ cwd: root });
    const expected = generateTurboJson(discovery);
    const actual = readTurboTasks(root);
    const missing = Object.keys(expected.tasks).filter(name => !(name in actual));

    expect(missing).toContain('typecheck:ts');
  });

  it('detects missing package script', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const pkgDir = path.join(root, 'packages', 'app');
    const scripts = readScripts(pkgDir);
    delete scripts['typecheck:ts'];
    writeJson(pkgDir, 'package.json', { name: '@test/app', scripts });

    const discovery = discoverWorkspace({ cwd: root });
    const pkg = discovery.packages[0]!;
    const expected = generatePackageScripts(pkg, discovery.isSelfHosted);
    const actual = readScripts(pkgDir);
    const missing = Object.keys(expected).filter(name => !(name in actual));

    expect(missing).toContain('typecheck:ts');
  });

  it('does not flag modified script values', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const pkgDir = path.join(root, 'packages', 'app');
    const scripts = readScripts(pkgDir);
    scripts['typecheck:ts'] = 'vue-tsc --noEmit';
    writeJson(pkgDir, 'package.json', { name: '@test/app', scripts });

    const discovery = discoverWorkspace({ cwd: root });
    const pkg = discovery.packages[0]!;
    const expected = generatePackageScripts(pkg, discovery.isSelfHosted);
    const actual = readScripts(pkgDir);
    const missing = Object.keys(expected).filter(name => !(name in actual));

    expect(missing).toHaveLength(0);
  });
});

describe('verify', () => {
  it('passes with no drift', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const exitCode = await runVerify(root, []);

    expect(exitCode).not.toBe(1);
  });

  it('sets exitCode 1 on drift', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });

    const exitCode = await runVerify(root, []);

    expect(exitCode).toBe(1);
  });

  it('--ignore suppresses specific drift', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });

    const exitCode = await runVerify(root, ['--ignore', 'typecheck:ts']);

    expect(exitCode).not.toBe(1);
  });
});

describe.concurrent(parseIgnoreArgs, () => {
  it('parses single --ignore flag', ({ expect }) => {
    const result = parseIgnoreArgs(['--ignore', 'test:vitest:slow']);

    expect(result.has('test:vitest:slow')).toBe(true);
  });

  it('parses multiple --ignore flags', ({ expect }) => {
    const result = parseIgnoreArgs([
      '--ignore', 'test:vitest:slow',
      '--ignore', 'test:vitest:e2e',
    ]);

    expect(result.has('test:vitest:slow')).toBe(true);
    expect(result.has('test:vitest:e2e')).toBe(true);
  });

  it('returns empty set with no flags', ({ expect }) => {
    const result = parseIgnoreArgs([]);

    expect(result.size).toBe(0);
  });

  it('ignores --ignore without value', ({ expect }) => {
    const result = parseIgnoreArgs(['--ignore']);

    expect(result.size).toBe(0);
  });
});

describe('verify codecov drift detection', () => {
  it('passes with valid codecov.yml after init', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const exitCode = await runVerify(root, []);

    expect(exitCode).not.toBe(1);
  });

  it('sets exitCode 1 when codecov.yml has invalid YAML', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(path.join(root, 'codecov.yml'), 'invalid: [}');

    const exitCode = await runVerify(root, []);

    expect(exitCode).toBe(1);
  });

  it('sets exitCode 1 when codecov.yml is missing', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(path.join(root, 'codecov.yml'), '');

    const exitCode = await runVerify(root, []);

    expect(exitCode).toBe(1);
  });

  it('sets exitCode 1 when flag is missing', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    const exitCode = await runVerify(root, []);

    expect(exitCode).toBe(1);
  });

  it('--ignore suppresses missing flag error', async ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    const exitCode = await runVerify(root, ['--ignore', 'app']);

    expect(exitCode).not.toBe(1);
  });
});
