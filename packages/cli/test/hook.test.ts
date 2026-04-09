import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import {
  hasHook,
  readRootScripts,
  resolveParallelCommand,
  resolveStep,
} from '#src/lib/hook.js';

const createTempDir = (): string =>
  mkdtempSync(join(tmpdir(), 'gtb-hook-test-'));

const writeJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(join(dir, name), JSON.stringify(data));
};

describe(hasHook, () => {
  it('returns true when hook script exists', ({ expect }) => {
    expect(hasHook({ 'gtb:compile:ts': 'vue-tsc -b' }, 'compile:ts')).toBe(true);
  });

  it('returns false when hook script does not exist', ({ expect }) => {
    expect(hasHook({ build: 'gtb build' }, 'compile:ts')).toBe(false);
  });

  it('returns false for empty scripts', ({ expect }) => {
    expect(hasHook({}, 'lint')).toBe(false);
  });
});

describe(resolveStep, () => {
  it('returns default function when no hook exists', ({ expect }) => {
    const defaultFn = async () => {};
    const resolved = resolveStep({}, 'compile:ts', defaultFn);

    expect(resolved).toBe(defaultFn);
  });

  it('returns different function when hook exists', ({ expect }) => {
    const defaultFn = async () => {};
    const resolved = resolveStep(
      { 'gtb:compile:ts': 'vue-tsc -b' },
      'compile:ts',
      defaultFn,
    );

    expect(resolved).not.toBe(defaultFn);
  });
});

describe(resolveParallelCommand, () => {
  it('returns default command when no hook exists', ({ expect }) => {
    const result = resolveParallelCommand({}, { name: 'lint:oxlint' }, 'oxlint');

    expect(result).toEqual({ command: 'oxlint', name: 'lint:oxlint' });
  });

  it('returns pnpm run command when hook exists', ({ expect }) => {
    const result = resolveParallelCommand(
      { 'gtb:lint:oxlint': 'my-linter' },
      { name: 'lint:oxlint' },
      'oxlint',
    );

    expect(result).toEqual({
      command: 'pnpm run gtb:lint:oxlint',
      name: 'lint:oxlint',
    });
  });
});

describe(readRootScripts, () => {
  it('reads scripts from package.json', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      scripts: { 'build': 'gtb build', 'gtb:compile:ts': 'vue-tsc -b' },
    });

    const result = readRootScripts({ cwd: root });

    expect(result).toEqual({
      'build': 'gtb build',
      'gtb:compile:ts': 'vue-tsc -b',
    });
  });

  it('returns empty object when no scripts field', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', { name: 'test' });

    const result = readRootScripts({ cwd: root });

    expect(result).toEqual({});
  });

  it('returns empty object when no package.json', ({ expect }) => {
    const root = createTempDir();

    const result = readRootScripts({ cwd: root });

    expect(result).toEqual({});
  });

  it('reads from workspace root when pnpm-workspace.yaml exists', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', {
      scripts: { 'gtb:compile': 'custom-compile' },
    });
    const subDir = join(root, 'packages', 'my-pkg');
    mkdirSync(subDir, { recursive: true });
    writeJson(subDir, 'package.json', {
      scripts: { test: 'vitest' },
    });

    const result = readRootScripts({ cwd: subDir });

    expect(result).toEqual({ 'gtb:compile': 'custom-compile' });
  });

  it('falls back to cwd when no workspace file', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      scripts: { 'gtb:lint': 'my-lint' },
    });

    const result = readRootScripts({ cwd: root });

    expect(result).toEqual({ 'gtb:lint': 'my-lint' });
  });
});
