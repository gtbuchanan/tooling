import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as v from 'valibot';
import { describe, it } from 'vitest';
import { parseIgnoreArgs } from '#src/commands/turbo-check.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { writeJsonFile } from '#src/lib/file-writer.js';
import { ManifestSchema } from '#src/lib/manifest.js';
import {
  generatePackageScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(v.record(v.string(), v.unknown())),
});

const createTempDir = (): string =>
  mkdtempSync(join(tmpdir(), 'gtb-turbo-check-'));

const writeJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(join(dir, name), JSON.stringify(data));
};

const createConsumerProject = (): string => {
  const root = createTempDir();
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
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

  const pkg = join(root, 'packages', 'app');
  mkdirSync(join(pkg, 'src'), { recursive: true });
  mkdirSync(join(pkg, 'test'), { recursive: true });
  writeJson(pkg, 'package.json', {
    devDependencies: {
      '@gtbuchanan/eslint-config': '^0.1.0',
      '@gtbuchanan/tsconfig': '^0.1.0',
      '@gtbuchanan/vitest-config': '^0.1.0',
    },
    name: '@test/app',
    scripts: {},
  });
  writeFileSync(join(pkg, 'tsconfig.json'), '{}');
  writeFileSync(join(pkg, 'eslint.config.ts'), '');
  writeFileSync(join(pkg, 'vitest.config.ts'), '');

  return root;
};

const initProject = (root: string): void => {
  const discovery = discoverWorkspace({ cwd: root });
  writeJsonFile(join(root, 'turbo.json'), generateTurboJson(discovery));

  for (const pkg of discovery.packages) {
    const scripts = generatePackageScripts(pkg, discovery.isSelfHosted);
    const pkgPath = join(pkg.dir, 'package.json');
    const manifest = v.parse(ManifestSchema, JSON.parse(readFileSync(pkgPath, 'utf-8')));
    writeJson(pkg.dir, 'package.json', {
      ...manifest,
      scripts: { ...manifest.scripts, ...scripts },
    });
  }
};

const readTurboTasks = (root: string): Record<string, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(join(root, 'turbo.json'), 'utf-8'));
  const { tasks } = v.parse(TurboJsonSchema, raw);

  return tasks ?? {};
};

const readScripts = (pkgDir: string): Record<string, string> => {
  const raw: unknown = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
  const { scripts } = v.parse(ManifestSchema, raw);

  return scripts ?? {};
};

describe('turbo:check drift detection', () => {
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
    writeJsonFile(join(root, 'turbo.json'), { $schema: '', tasks });

    const discovery = discoverWorkspace({ cwd: root });
    const expected = generateTurboJson(discovery);
    const actual = readTurboTasks(root);
    const missing = Object.keys(expected.tasks).filter(name => !(name in actual));

    expect(missing).toContain('typecheck:ts');
  });

  it('detects missing package script', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const pkgDir = join(root, 'packages', 'app');
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

    const pkgDir = join(root, 'packages', 'app');
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

describe(parseIgnoreArgs, () => {
  it('parses single --ignore flag', ({ expect }) => {
    const result = parseIgnoreArgs(['--ignore', 'test:vitest:slow']);

    expect(result.has('test:vitest:slow')).toBe(true);
  });

  it('parses multiple --ignore flags', ({ expect }) => {
    const result = parseIgnoreArgs([
      '--ignore', 'test:vitest:slow',
      '--ignore', 'lint:oxlint',
    ]);

    expect(result.has('test:vitest:slow')).toBe(true);
    expect(result.has('lint:oxlint')).toBe(true);
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
