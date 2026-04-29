import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import * as v from 'valibot';
import { describe, it } from 'vitest';
import { runSync } from '#src/commands/root/sync.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { mergePackageScripts, readJsonFile, writeJsonFile } from '#src/lib/file-writer.js';
import { createLogger } from '#src/lib/logger.js';
import { ManifestSchema } from '#src/lib/manifest.js';
import {
  generatePackageScripts,
  generateRootScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';
import { createTempDir, writeJson } from './helpers.ts';

const silentSink = new Writable({
  write: (_chunk, _enc, cb) => {
    cb();
  },
});
const silentLogger = createLogger(silentSink, silentSink);

const createConsumerProject = (): string => {
  const root = createTempDir();
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  writeJson(root, 'package.json', {
    devDependencies: {
      '@gtbuchanan/cli': '^0.1.0',
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
      '@gtbuchanan/vitest-config': '^0.1.0',
    },
    name: 'consumer-app',
    private: true,
    scripts: { prepare: 'gtb prepare' },
  });

  const app = path.join(root, 'packages', 'app');
  mkdirSync(path.join(app, 'src'), { recursive: true });
  mkdirSync(path.join(app, 'test'), { recursive: true });
  writeJson(app, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
      '@gtbuchanan/vitest-config': '^0.1.0',
    },
    name: '@consumer/app',
    publishConfig: { directory: 'dist/source' },
    version: '1.0.0',
  });
  writeFileSync(path.join(app, 'tsconfig.json'), '{}');
  writeFileSync(path.join(app, 'eslint.config.ts'), '');
  writeFileSync(path.join(app, 'vitest.config.ts'), '');

  const lib = path.join(root, 'packages', 'lib');
  mkdirSync(path.join(lib, 'src'), { recursive: true });
  writeJson(lib, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
    },
    name: '@consumer/lib',
    private: true,
    version: '1.0.0',
  });
  writeFileSync(path.join(lib, 'tsconfig.json'), '{}');
  writeFileSync(path.join(lib, 'eslint.config.ts'), '');

  return root;
};

describe.concurrent('sync helpers', () => {
  it('generates turbo.json with correct tasks for consumer project', ({ expect }) => {
    const root = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });

    const turboJson = generateTurboJson(discovery);

    expect(Object.keys(turboJson.tasks)).toStrictEqual(
      expect.arrayContaining([
        'build', 'build:ci', 'check', 'compile:ts', 'lint:eslint',
        'pack:npm', 'test:vitest:fast', 'test:vitest:slow', 'typecheck:ts',
      ]),
    );
  });

  it('generates per-package scripts with gtb task commands', ({ expect }) => {
    const root = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });
    const app = discovery.packages.find(pkg => pkg.dir.endsWith('app'));

    const scripts = generatePackageScripts(app!, discovery.isSelfHosted);

    expect(scripts).toMatchObject({
      'compile:ts': 'gtb task compile:ts',
      'lint:eslint': 'gtb task lint:eslint',
      'test:vitest:fast': 'gtb task test:vitest:fast',
      'test:vitest:slow': 'gtb task test:vitest:slow',
      'typecheck:ts': 'gtb task typecheck:ts',
    });
  });

  it('generates fewer scripts for private package without tests', ({ expect }) => {
    const root = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });
    const lib = discovery.packages.find(pkg => pkg.dir.endsWith('lib'));

    const scripts = generatePackageScripts(lib!, discovery.isSelfHosted);

    expect(scripts).toHaveProperty('typecheck:ts');
    expect(scripts).toHaveProperty('lint:eslint');
    expect(scripts).not.toHaveProperty('compile:ts');
    expect(scripts).not.toHaveProperty('test:vitest:fast');
  });

  it('generates root convenience scripts', ({ expect }) => {
    const root = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });

    const scripts = generateRootScripts(discovery);

    expect(scripts).toMatchObject({
      'build': 'turbo run build',
      'build:ci': 'turbo run build:ci',
      'check': 'turbo run check',
      'pack': 'turbo run pack',
      'prepare': 'gtb prepare',
      'verify': 'gtb verify',
    });
  });

  it('writes turbo.json and merges scripts end-to-end', ({ expect }) => {
    const root = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });

    const turboPath = path.join(root, 'turbo.json');
    writeJsonFile(turboPath, generateTurboJson(discovery));

    expect(existsSync(turboPath)).toBe(true);

    const parsed: unknown = JSON.parse(readFileSync(turboPath, 'utf8'));

    expect(parsed).toHaveProperty('$schema');
    expect(parsed).toHaveProperty('tasks');
  });

  it('merges scripts without overwriting existing', ({ expect }) => {
    const root = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });
    const rootScripts = generateRootScripts(discovery);

    const result = mergePackageScripts(
      path.join(root, 'package.json'), rootScripts, false,
    );

    expect(result.skipped).toContain('prepare');
    expect(result.added).toContain('check');
  });

  it('detects self-hosted workspace', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/cli': 'workspace:*' },
    });

    const discovery = discoverWorkspace({ cwd: root });

    expect(discovery.isSelfHosted).toBe(true);
  });

  it('generates gtb shim for self-hosted', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      devDependencies: {
        '@gtbuchanan/cli': 'workspace:*',
        '@gtbuchanan/tsconfig': 'workspace:*',
      },
    });
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'tsconfig.json'), '{}');

    const discovery = discoverWorkspace({ cwd: root });
    const scripts = generatePackageScripts(
      discovery.packages[0]!, discovery.isSelfHosted, discovery.rootDir,
    );

    expect(scripts['typecheck:ts']).toBe('pnpm run gtb task typecheck:ts');
    expect(scripts['gtb']).toContain('packages/cli/bin/gtb.ts');
  });
});

describe.concurrent(runSync, () => {
  it('writes turbo.json and scripts', ({ expect }) => {
    const root = createConsumerProject();
    runSync({ cwd: root, logger: silentLogger });

    expect(existsSync(path.join(root, 'turbo.json'))).toBe(true);

    const scripts: unknown = JSON.parse(
      readFileSync(path.join(root, 'packages', 'app', 'package.json'), 'utf8'),
    );

    expect(scripts).toHaveProperty('scripts.typecheck:ts');
  });

  it('generates codecov.yml when packages have vitest tests', ({ expect }) => {
    const root = createConsumerProject();
    runSync({ cwd: root, logger: silentLogger });

    const codecovPath = path.join(root, 'codecov.yml');

    expect(existsSync(codecovPath)).toBe(true);

    const content = readFileSync(codecovPath, 'utf8');

    expect(content).toContain('app:');
    expect(content).toContain('carryforward');
  });

  it('preserves existing codecov.yml user config', ({ expect }) => {
    const root = createConsumerProject();
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'codecov:\n  require_ci_to_pass: true\n',
    );

    runSync({ cwd: root, logger: silentLogger });

    const content = readFileSync(path.join(root, 'codecov.yml'), 'utf8');

    expect(content).toContain('require_ci_to_pass');
    expect(content).toContain('carryforward');
  });

  it('force overwrites existing scripts', ({ expect }) => {
    const root = createConsumerProject();
    runSync({ cwd: root, logger: silentLogger });

    const appPkg = path.join(root, 'packages', 'app', 'package.json');
    const manifest = v.parse(ManifestSchema, readJsonFile(appPkg));
    const scripts = { ...manifest.scripts, 'typecheck:ts': 'custom-tsc' };
    writeJsonFile(appPkg, { ...manifest, scripts });

    runSync({ cwd: root, force: true, logger: silentLogger });

    const result: unknown = JSON.parse(
      readFileSync(path.join(root, 'packages', 'app', 'package.json'), 'utf8'),
    );

    expect(result).toHaveProperty('scripts.typecheck:ts', 'gtb task typecheck:ts');
  });
});
