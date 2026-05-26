import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import * as build from '@gtbuchanan/test-utils/builders';
import * as v from 'valibot';
import { describe, it } from 'vitest';
import { runSync, syncCommand } from '#src/commands/root/sync.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { mergePackageScripts, readJsonFile, writeJsonFile } from '#src/lib/file-writer.js';
import { createLogger } from '#src/lib/logger.js';
import { ManifestSchema } from '#src/lib/manifest.js';
import {
  generatePackageScripts,
  generateRootScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';
import { captureLogger, createTempDir, writeJson } from './helpers.ts';

const silentSink = new Writable({
  write: (_chunk, _enc, cb) => {
    cb();
  },
});
const silentLogger = createLogger(silentSink, silentSink);

interface ConsumerPackage {
  readonly basename: string;
  readonly dir: string;
  readonly name: string;
}

interface ConsumerProject {
  readonly app: ConsumerPackage;
  readonly lib: ConsumerPackage;
  readonly root: string;
}

const createConsumerProject = (): ConsumerProject => {
  const root = createTempDir();
  const appBasename = build.packageName();
  const appName = build.scopedPackageName();
  const libBasename = build.packageName();
  const libName = build.scopedPackageName();

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
    scripts: { prepare: 'gtb prepare' },
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
    publishConfig: { directory: build.publishDirectory() },
    version: build.semverVersion(),
  });
  writeFileSync(path.join(appDir, 'tsconfig.json'), '{}');
  writeFileSync(path.join(appDir, 'eslint.config.ts'), '');
  writeFileSync(path.join(appDir, 'vitest.config.ts'), '');

  const libDir = path.join(root, 'packages', libBasename);
  mkdirSync(path.join(libDir, 'src'), { recursive: true });
  writeJson(libDir, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': build.semverRange(),
      '@gtbuchanan/tsconfig': build.semverRange(),
    },
    name: libName,
    private: true,
    version: build.semverVersion(),
  });
  writeFileSync(path.join(libDir, 'tsconfig.json'), '{}');
  writeFileSync(path.join(libDir, 'eslint.config.ts'), '');

  return {
    app: { basename: appBasename, dir: appDir, name: appName },
    lib: { basename: libBasename, dir: libDir, name: libName },
    root,
  };
};

describe.concurrent('sync helpers', () => {
  it('generates turbo.json with correct tasks for consumer project', ({ expect }) => {
    const { root } = createConsumerProject();
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
    const { app, root } = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });
    const appPkg = discovery.packages.find(pkg => pkg.dir === app.dir);

    const scripts = generatePackageScripts(appPkg!, discovery.isSelfHosted);

    expect(scripts).toMatchObject({
      'compile:ts': 'gtb task compile:ts',
      'lint:eslint': 'gtb task lint:eslint',
      'test:vitest:fast': 'gtb task test:vitest:fast',
      'test:vitest:slow': 'gtb task test:vitest:slow',
      'typecheck:ts': 'gtb task typecheck:ts',
    });
  });

  it('generates fewer scripts for private package without tests', ({ expect }) => {
    const { lib, root } = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });
    const libPkg = discovery.packages.find(pkg => pkg.dir === lib.dir);

    const scripts = generatePackageScripts(libPkg!, discovery.isSelfHosted);

    expect(scripts).toHaveProperty('typecheck:ts');
    expect(scripts).toHaveProperty('lint:eslint');
    expect(scripts).not.toHaveProperty('compile:ts');
    expect(scripts).not.toHaveProperty('test:vitest:fast');
  });

  it('generates root convenience scripts', ({ expect }) => {
    const { root } = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });

    const scripts = generateRootScripts(discovery);

    expect(scripts).toMatchObject({
      'build': 'gtb turbo run build',
      'build:ci': 'gtb turbo run build:ci',
      'check': 'gtb turbo run check',
      'pack': 'gtb turbo run pack',
      'prepare': 'gtb prepare',
      'verify': 'gtb verify',
    });
  });

  it('writes turbo.json and merges scripts end-to-end', ({ expect }) => {
    const { root } = createConsumerProject();
    const discovery = discoverWorkspace({ cwd: root });

    const turboPath = path.join(root, 'turbo.json');
    writeJsonFile(turboPath, generateTurboJson(discovery));

    expect(existsSync(turboPath)).toBe(true);

    const parsed: unknown = JSON.parse(readFileSync(turboPath, 'utf8'));

    expect(parsed).toHaveProperty('$schema');
    expect(parsed).toHaveProperty('tasks');
  });

  it('merges scripts without overwriting existing', ({ expect }) => {
    const { root } = createConsumerProject();
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
    const { app, root } = createConsumerProject();
    runSync({ cwd: root, logger: silentLogger });

    expect(existsSync(path.join(root, 'turbo.json'))).toBe(true);

    const scripts: unknown = JSON.parse(
      readFileSync(path.join(app.dir, 'package.json'), 'utf8'),
    );

    expect(scripts).toHaveProperty('scripts.typecheck:ts');
  });

  it('generates codecov.yml when packages have vitest tests', ({ expect }) => {
    const { app, root } = createConsumerProject();
    runSync({ cwd: root, logger: silentLogger });

    const codecovPath = path.join(root, 'codecov.yml');

    expect(existsSync(codecovPath)).toBe(true);

    const content = readFileSync(codecovPath, 'utf8');

    expect(content).toContain(`${app.basename}:`);
    expect(content).toContain('carryforward');
  });

  it('preserves existing codecov.yml user config', ({ expect }) => {
    const { root } = createConsumerProject();
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
    const { app, root } = createConsumerProject();
    runSync({ cwd: root, logger: silentLogger });

    const appPkg = path.join(app.dir, 'package.json');
    const manifest = v.parse(ManifestSchema, readJsonFile(appPkg));
    const scripts = { ...manifest.scripts, 'typecheck:ts': 'custom-tsc' };
    writeJsonFile(appPkg, { ...manifest, scripts });

    runSync({ cwd: root, force: true, logger: silentLogger });

    const result: unknown = JSON.parse(readFileSync(appPkg, 'utf8'));

    expect(result).toHaveProperty('scripts.typecheck:ts', 'gtb task typecheck:ts');
  });
});

describe.concurrent(syncCommand, () => {
  it('passes cwd from args through to runSync', ({ expect }) => {
    const { root } = createConsumerProject();
    const { logger } = captureLogger();

    syncCommand({ cwd: root }, logger);

    expect(existsSync(path.join(root, 'turbo.json'))).toBe(true);
  });

  it('passes force from args through to runSync', ({ expect }) => {
    const { app, root } = createConsumerProject();
    const { logger } = captureLogger();
    syncCommand({ cwd: root }, logger);

    const appPkg = path.join(app.dir, 'package.json');
    const manifest = v.parse(ManifestSchema, readJsonFile(appPkg));
    writeJsonFile(appPkg, {
      ...manifest,
      scripts: { ...manifest.scripts, 'typecheck:ts': 'custom-tsc' },
    });

    syncCommand({ cwd: root, force: true }, logger);

    const result: unknown = JSON.parse(readFileSync(appPkg, 'utf8'));

    expect(result).toHaveProperty('scripts.typecheck:ts', 'gtb task typecheck:ts');
  });

  it('routes progress messages through the injected logger', ({ expect }) => {
    const { root } = createConsumerProject();
    const { logger, out } = captureLogger();

    syncCommand({ cwd: root }, logger);

    expect(out()).toContain(`wrote ${path.join(root, 'turbo.json')}`);
  });
});
