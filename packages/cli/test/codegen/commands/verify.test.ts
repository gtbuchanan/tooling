import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { runSync } from '#src/codegen/commands/sync.js';
import { parseIgnoreArgs, runVerify, verifyCommand } from '#src/codegen/commands/verify.js';
import {
  generatePackageScripts,
  generateTurboJson,
} from '#src/codegen/turbo-config.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { readJsonFile, sortKeysDeep, writeJsonFile } from '#src/core/file-writer.js';
import { capabilities } from '#src/toolchains/index.js';
import {
  captureLogger,
  createHkOnlyProject,
  createTempDir,
  initProject,
  readScripts,
  readTurboTasks,
  writeJson,
} from '#test/helpers.js';
import { createWorkspaceDepProject } from '#test/toolchains/npm/fixtures.js';

/**
 * Deletes `typecheck:ts` from the synced root `turbo.json`, leaving the rest
 * as sync wrote it.
 */
const removeTypecheckTask = (root: string): void => {
  const turboPath = path.join(root, 'turbo.json');
  const { 'typecheck:ts': _removed, ...tasks } = readTurboTasks(root);
  writeJsonFile(turboPath, sortKeysDeep({ ...readJsonFile(turboPath), tasks }));
};

interface ConsumerProject {
  readonly app: { basename: string; dir: string; name: string };
  readonly root: string;
}

const createConsumerProject = (): ConsumerProject => {
  const root = createTempDir();
  /* Directory, manifest scope, and unscoped name are derived from one seed
     with distinct suffixes, so they can never coincide. Independent builder
     calls could collide and let an assertion pass against the basename. */
  const appSeed = build.packageName();
  const appBasename = `${appSeed}-dir`;
  const appUnscoped = `${appSeed}-name`;
  const appName = `@${appSeed}-scope/${appUnscoped}`;

  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  writeJson(root, 'package.json', {
    devDependencies: {
      '@gtbuchanan/cli': build.semverRange(),
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

  return {
    app: { basename: appBasename, dir: appDir, name: appName },
    root,
  };
};

describe.concurrent('verify drift detection', () => {
  it('all expected tasks present after init', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);

    const discovery = discoverWorkspace({ capabilities, cwd: root });
    const expected = generateTurboJson(discovery);
    const actual = readTurboTasks(root);

    for (const name of Object.keys(expected.tasks)) {
      expect(actual).toHaveProperty(name);
    }
  });

  it('detects missing turbo.json task', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);

    removeTypecheckTask(root);

    const discovery = discoverWorkspace({ capabilities, cwd: root });
    const expected = generateTurboJson(discovery);
    const actual = readTurboTasks(root);
    const missing = Object.keys(expected.tasks).filter(name => !Object.hasOwn(actual, name));

    expect(missing).toContain('typecheck:ts');
  });

  it('detects missing package script', ({ expect }) => {
    const { app, root } = createConsumerProject();
    initProject(root);

    const scripts = readScripts(app.dir);
    delete scripts['typecheck:ts'];
    writeJson(app.dir, 'package.json', { name: app.name, scripts });

    const discovery = discoverWorkspace({ capabilities, cwd: root });
    const pkg = discovery.packages[0]!;
    const expected = generatePackageScripts(pkg, discovery.cli);
    const actual = readScripts(app.dir);
    const missing = Object.keys(expected).filter(name => !Object.hasOwn(actual, name));

    expect(missing).toContain('typecheck:ts');
  });

  it('does not flag modified script values', ({ expect }) => {
    const { app, root } = createConsumerProject();
    initProject(root);

    const scripts = readScripts(app.dir);
    scripts['typecheck:ts'] = faker.lorem.words({ min: 1, max: 3 });
    writeJson(app.dir, 'package.json', { name: app.name, scripts });

    const discovery = discoverWorkspace({ capabilities, cwd: root });
    const pkg = discovery.packages[0]!;
    const expected = generatePackageScripts(pkg, discovery.cli);
    const actual = readScripts(app.dir);
    const missing = Object.keys(expected).filter(name => !Object.hasOwn(actual, name));

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

    removeTypecheckTask(root);

    const drift = runVerify({ cwd: root });

    expect(drift.some(msg => msg.includes('typecheck:ts'))).toBe(true);
  });

  it('ignored set suppresses specific drift', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);

    removeTypecheckTask(root);

    const drift = runVerify({ cwd: root, ignored: new Set(['typecheck:ts']) });

    expect(drift).toHaveLength(0);
  });

  it('passes a synced hk-only adopter that has none of the build config', ({ expect }) => {
    const root = createHkOnlyProject();
    runSync({ cwd: root, logger: captureLogger().logger });

    expect(runVerify({ cwd: root })).toStrictEqual([]);
  });

  it('reports a hand-edited mise fragment', ({ expect }) => {
    const root = createHkOnlyProject();
    runSync({ cwd: root, logger: captureLogger().logger });
    const fragmentPath = path.join(root, '.config', 'mise', 'conf.d', 'gtb.toml');
    writeFileSync(fragmentPath, '[tasks."hk:all"]\nrun = "hk check --all"\n');

    expect(runVerify({ cwd: root })).toStrictEqual([
      `${fragmentPath}: out of date`,
      'run gtb sync to apply these changes',
    ]);
  });

  it('reports what the toolchains check', ({ expect }) => {
    const { dependency, root } = createWorkspaceDepProject();

    expect(runVerify({ cwd: root })).toContainEqual(expect.stringContaining(dependency.name));
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
  // A synced project, so only the argument can fail it
  it('returns 1 when given a positional argument', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);
    const { logger, err } = captureLogger();

    const code = verifyCommand(['mise'], { cwd: root, positionals: ['mise'] }, logger);

    expect(code).toBe(1);
    expect(err()).toBe("gtb verify takes no arguments, but got 'mise'\n");
  });

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
    removeTypecheckTask(root);
    const { logger, out, err } = captureLogger();

    const code = verifyCommand([], { cwd: root }, logger);

    expect(code).toBe(1);
    expect(err()).toContain('typecheck:ts');
    expect(out()).toBe('');
  });

  it('forwards --ignore flags from rawArgs to runVerify', ({ expect }) => {
    const { root } = createConsumerProject();
    initProject(root);
    removeTypecheckTask(root);
    const { logger } = captureLogger();

    const code = verifyCommand(['--ignore', 'typecheck:ts'], { cwd: root }, logger);

    expect(code).toBe(0);
  });
});
