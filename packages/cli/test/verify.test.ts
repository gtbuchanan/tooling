import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { parseIgnoreArgs, runVerify, verifyCommand } from '#src/commands/root/verify.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { writeJsonFile } from '#src/lib/file-writer.js';
import {
  generatePackageScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';
import {
  captureLogger, createTempDir, initProject, readScripts, readTurboTasks, writeJson,
} from './helpers.ts';

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

describe.concurrent(runVerify, () => {
  it('returns no drift when project is fully synced', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const drift = runVerify({ cwd: root });

    expect(drift).toHaveLength(0);
  });

  it('reports drift on missing turbo task', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes('typecheck:ts'))).toBe(true);
  });

  it('ignored set suppresses specific drift', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });

    const drift = runVerify({ cwd: root, ignored: new Set(['typecheck:ts']) });

    expect(drift).toHaveLength(0);
  });

  it('reports drift when codecov.yml has invalid YAML', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(path.join(root, 'codecov.yml'), 'invalid: [}');

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes('codecov.yml'))).toBe(true);
  });

  it('reports drift when codecov.yml is empty', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(path.join(root, 'codecov.yml'), '');

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes('codecov.yml'))).toBe(true);
  });

  it('reports drift when a codecov flag is missing', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes("missing flag 'app'"))).toBe(true);
  });

  it('ignored set suppresses missing codecov flag drift', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    const drift = runVerify({ cwd: root, ignored: new Set(['app']) });

    expect(drift).toHaveLength(0);
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

describe.concurrent(verifyCommand, () => {
  it('returns 0 and logs success when there is no drift', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    const { logger, out, err } = captureLogger();

    const code = verifyCommand([], { cwd: root }, logger);

    expect(code).toBe(0);
    expect(out()).toContain('verify passed');
    expect(err()).toBe('');
  });

  it('returns 1 and writes each drift message to stderr on drift', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });
    const { logger, out, err } = captureLogger();

    const code = verifyCommand([], { cwd: root }, logger);

    expect(code).toBe(1);
    expect(err()).toContain('typecheck:ts');
    expect(out()).toBe('');
  });

  it('forwards --ignore flags from rawArgs to runVerify', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });
    const { logger } = captureLogger();

    const code = verifyCommand(['--ignore', 'typecheck:ts'], { cwd: root }, logger);

    expect(code).toBe(0);
  });
});
