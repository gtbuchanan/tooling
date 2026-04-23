import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCommand } from 'citty';
import * as v from 'valibot';
import { describe, it, vi } from 'vitest';
import { sync } from '#src/commands/root/sync.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { mergePackageScripts, readJsonFile, writeJsonFile } from '#src/lib/file-writer.js';
import { ManifestSchema } from '#src/lib/manifest.js';
import {
  generatePackageScripts,
  generateRootScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';

const runSync = async (dir: string, args: readonly string[]): Promise<void> => {
  const origCwd = process.cwd();
  vi.spyOn(console, 'log').mockReturnValue();

  try {
    process.chdir(dir);
    await runCommand(sync, { rawArgs: [...args] });
  } finally {
    process.chdir(origCwd);
  }
};

const createConsumerProject = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'gtb-sync-'));
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    devDependencies: {
      '@gtbuchanan/cli': '^0.1.0',
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
      '@gtbuchanan/vitest-config': '^0.1.0',
    },
    name: 'consumer-app',
    private: true,
    scripts: { prepare: 'gtb prepare' },
  }));

  const app = path.join(root, 'packages', 'app');
  mkdirSync(path.join(app, 'src'), { recursive: true });
  mkdirSync(path.join(app, 'test'), { recursive: true });
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({
    devDependencies: {
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
      '@gtbuchanan/vitest-config': '^0.1.0',
    },
    name: '@consumer/app',
    publishConfig: { directory: 'dist/source' },
    version: '1.0.0',
  }));
  writeFileSync(path.join(app, 'tsconfig.json'), '{}');
  writeFileSync(path.join(app, 'eslint.config.ts'), '');
  writeFileSync(path.join(app, 'vitest.config.ts'), '');

  const lib = path.join(root, 'packages', 'lib');
  mkdirSync(path.join(lib, 'src'), { recursive: true });
  writeFileSync(path.join(lib, 'package.json'), JSON.stringify({
    devDependencies: {
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
    },
    name: '@consumer/lib',
    private: true,
    version: '1.0.0',
  }));
  writeFileSync(path.join(lib, 'tsconfig.json'), '{}');
  writeFileSync(path.join(lib, 'eslint.config.ts'), '');

  return root;
};

describe('sync', () => {
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
    const root = mkdtempSync(path.join(tmpdir(), 'gtb-selfhost-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      devDependencies: { '@gtbuchanan/cli': 'workspace:*' },
    }));

    const discovery = discoverWorkspace({ cwd: root });

    expect(discovery.isSelfHosted).toBe(true);
  });

  it('sync command writes turbo.json and scripts', async ({ expect }) => {
    const root = createConsumerProject();
    await runSync(root, []);

    expect(existsSync(path.join(root, 'turbo.json'))).toBe(true);

    const scripts: unknown = JSON.parse(
      readFileSync(path.join(root, 'packages', 'app', 'package.json'), 'utf8'),
    );

    expect(scripts).toHaveProperty('scripts.typecheck:ts');
  });

  it('sync generates codecov.yml when packages have vitest tests', async ({ expect }) => {
    const root = createConsumerProject();
    await runSync(root, []);

    const codecovPath = path.join(root, 'codecov.yml');

    expect(existsSync(codecovPath)).toBe(true);

    const content = readFileSync(codecovPath, 'utf8');

    expect(content).toContain('app:');
    expect(content).toContain('carryforward');
  });

  it('sync preserves existing codecov.yml user config', async ({ expect }) => {
    const root = createConsumerProject();
    writeFileSync(
      path.join(root, 'codecov.yml'),
      'codecov:\n  require_ci_to_pass: true\n',
    );

    await runSync(root, []);

    const content = readFileSync(path.join(root, 'codecov.yml'), 'utf8');

    expect(content).toContain('require_ci_to_pass');
    expect(content).toContain('carryforward');
  });

  it('sync --force overwrites existing scripts', async ({ expect }) => {
    const root = createConsumerProject();
    await runSync(root, []);

    const appPkg = path.join(root, 'packages', 'app', 'package.json');
    const manifest = v.parse(ManifestSchema, readJsonFile(appPkg));
    const scripts = { ...manifest.scripts, 'typecheck:ts': 'custom-tsc' };
    writeJsonFile(appPkg, { ...manifest, scripts });

    await runSync(root, ['--force']);

    const result: unknown = JSON.parse(
      readFileSync(path.join(root, 'packages', 'app', 'package.json'), 'utf8'),
    );

    expect(result).toHaveProperty('scripts.typecheck:ts', 'gtb task typecheck:ts');
  });

  it('generates gtb shim for self-hosted', ({ expect }) => {
    const root = mkdtempSync(path.join(tmpdir(), 'gtb-selfhost-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      devDependencies: {
        '@gtbuchanan/cli': 'workspace:*',
        '@gtbuchanan/tsconfig': 'workspace:*',
      },
    }));
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
