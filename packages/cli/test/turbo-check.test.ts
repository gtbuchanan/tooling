import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, vi } from 'vitest';
import { parseIgnoreArgs, turboCheck } from '#src/commands/turbo-check.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { writeJsonFile } from '#src/lib/file-writer.js';
import {
  generatePackageScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';
import {
  createTempDir, initProject, readScripts, readTurboTasks, writeJson,
} from './helpers.ts';

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

describe(turboCheck, () => {
  const runInDir = (dir: string, fn: () => void): void => {
    const origCwd = process.cwd();
    const origExitCode = process.exitCode;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      process.chdir(dir);
      fn();
    } finally {
      process.chdir(origCwd);
      process.exitCode = origExitCode;
    }
  };

  it('passes with no drift', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    runInDir(root, () => {
      turboCheck([]);

      expect(process.exitCode).not.toBe(1);
    });
  });

  it('sets exitCode 1 on drift', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(join(root, 'turbo.json'), { $schema: '', tasks });

    runInDir(root, () => {
      turboCheck([]);

      expect(process.exitCode).toBe(1);
    });
  });

  it('--ignore suppresses specific drift', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    const tasks = readTurboTasks(root);
    delete tasks['typecheck:ts'];
    writeJsonFile(join(root, 'turbo.json'), { $schema: '', tasks });

    runInDir(root, () => {
      turboCheck(['--ignore', 'typecheck:ts']);

      expect(process.exitCode).not.toBe(1);
    });
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

describe('turbo:check codecov drift detection', () => {
  const runInDir = (dir: string, fn: () => void): void => {
    const origCwd = process.cwd();
    const origExitCode = process.exitCode;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      process.chdir(dir);
      fn();
    } finally {
      process.chdir(origCwd);
      process.exitCode = origExitCode;
    }
  };

  it('passes with valid codecov.yml after init', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);

    runInDir(root, () => {
      turboCheck([]);

      expect(process.exitCode).not.toBe(1);
    });
  });

  it('sets exitCode 1 when codecov.yml has invalid YAML', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(join(root, 'codecov.yml'), 'invalid: [}');

    runInDir(root, () => {
      turboCheck([]);

      expect(process.exitCode).toBe(1);
    });
  });

  it('sets exitCode 1 when codecov.yml is missing', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(join(root, 'codecov.yml'), '');

    runInDir(root, () => {
      turboCheck([]);

      expect(process.exitCode).toBe(1);
    });
  });

  it('sets exitCode 1 when flag is missing', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(
      join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    runInDir(root, () => {
      turboCheck([]);

      expect(process.exitCode).toBe(1);
    });
  });

  it('--ignore suppresses missing flag error', ({ expect }) => {
    const root = createConsumerProject();
    initProject(root);
    writeFileSync(
      join(root, 'codecov.yml'),
      'flags: {}\ncomponent_management:\n  individual_components: []\n',
    );

    runInDir(root, () => {
      turboCheck(['--ignore', 'app']);

      expect(process.exitCode).not.toBe(1);
    });
  });
});
