import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
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

interface ConsumerProject {
  readonly app: { basename: string; dir: string; name: string };
  readonly root: string;
}

const createConsumerProject = (): ConsumerProject => {
  const root = createTempDir();
  const appBasename = build.packageName();
  const appName = build.scopedPackageName();

  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  writeJson(root, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': build.semverRange(),
      '@gtbuchanan/tsconfig': build.semverRange(),
      '@gtbuchanan/vitest-config': build.semverRange(),
    },
    name: build.packageName(),
    private: true,
    scripts: {},
  });

  const appDir = path.join(root, 'packages', appBasename);
  mkdirSync(path.join(appDir, 'src'), { recursive: true });
  mkdirSync(path.join(appDir, 'test'), { recursive: true });
  writeJson(appDir, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': build.semverRange(),
      '@gtbuchanan/tsconfig': build.semverRange(),
      '@gtbuchanan/vitest-config': build.semverRange(),
    },
    name: appName,
    scripts: {},
  });
  writeFileSync(path.join(appDir, 'tsconfig.json'), '{}');
  writeFileSync(path.join(appDir, 'eslint.config.ts'), '');
  writeFileSync(path.join(appDir, 'vitest.config.ts'), '');

  return { app: { basename: appBasename, dir: appDir, name: appName }, root };
};

describe.concurrent('verify drift detection', () => {
  it('all expected tasks present after init', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);

    const discovery = discoverWorkspace({ cwd: root });
    const expected = generateTurboJson(discovery);
    const actual = readTurboTasks(root);

    for (const name of Object.keys(expected.tasks)) {
      expect(actual).toHaveProperty(name);
    }
  });

  it('detects missing turbo.json task', ({ expect }) => {
    const { root } = createConsumerProject();
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
    const { app, root } = createConsumerProject();
    initProject(root);

    const scripts = readScripts(app.dir);
    delete scripts['typecheck:ts'];
    writeJson(app.dir, 'package.json', { name: app.name, scripts });

    const discovery = discoverWorkspace({ cwd: root });
    const pkg = discovery.packages[0]!;
    const expected = generatePackageScripts(pkg, discovery.isSelfHosted);
    const actual = readScripts(app.dir);
    const missing = Object.keys(expected).filter(name => !(name in actual));

    expect(missing).toContain('typecheck:ts');
  });

  it('does not flag modified script values', ({ expect }) => {
    const { app, root } = createConsumerProject();
    initProject(root);

    const scripts = readScripts(app.dir);
    scripts['typecheck:ts'] = faker.lorem.words({ min: 1, max: 3 });
    writeJson(app.dir, 'package.json', { name: app.name, scripts });

    const discovery = discoverWorkspace({ cwd: root });
    const pkg = discovery.packages[0]!;
    const expected = generatePackageScripts(pkg, discovery.isSelfHosted);
    const actual = readScripts(app.dir);
    const missing = Object.keys(expected).filter(name => !(name in actual));

    expect(missing).toHaveLength(0);
  });
});

describe.concurrent(runVerify, () => {
  it('returns no drift when project is fully synced', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);

    const drift = runVerify({ cwd: root });

    expect(drift).toHaveLength(0);
  });

  it('reports drift on missing turbo task', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes('typecheck:ts'))).toBe(true);
  });

  it('ignored set suppresses specific drift', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });

    const drift = runVerify({ cwd: root, ignored: new Set(['typecheck:ts']) });

    expect(drift).toHaveLength(0);
  });

  it('reports drift when codecov.yml has invalid YAML', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);
    writeFileSync(path.join(root, 'codecov.yml'), 'invalid: [}');

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes('codecov.yml'))).toBe(true);
  });

  it('reports drift when codecov.yml is empty', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);
    writeFileSync(path.join(root, 'codecov.yml'), '');

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes('codecov.yml'))).toBe(true);
  });

  it('reports drift when a codecov flag is missing', ({ expect }) => {
    const { app, root } = createConsumerProject();
    initProject(root);
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes(`missing flag '${app.basename}'`))).toBe(true);
  });

  it('ignored set suppresses missing codecov flag drift', ({ expect }) => {
    const { app, root } = createConsumerProject();
    initProject(root);
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    const drift = runVerify({ cwd: root, ignored: new Set([app.basename]) });

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
    const { root } = createConsumerProject();
    initProject(root);
    const { logger, out, err } = captureLogger();

    const code = verifyCommand([], { cwd: root }, logger);

    expect(code).toBe(0);
    expect(out()).toContain('verify passed');
    expect(err()).toBe('');
  });

  it('returns 1 and writes each drift message to stderr on drift', ({ expect }) => {
    const { root } = createConsumerProject();
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
    const { root } = createConsumerProject();
    initProject(root);
    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(path.join(root, 'turbo.json'), { $schema: '', tasks });
    const { logger } = captureLogger();

    const code = verifyCommand(['--ignore', 'typecheck:ts'], { cwd: root }, logger);

    expect(code).toBe(0);
  });
});
