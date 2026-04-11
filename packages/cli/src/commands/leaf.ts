import { run } from '../lib/process.ts';

/** Runs `tsc --noEmit` for type-checking with optional pass-through args. */
export const typecheckTs = async (
  args: readonly string[],
): Promise<void> => {
  await run('tsc', { args: ['--noEmit', ...args] });
};

/** Runs `tsc -p tsconfig.build.json` to emit compiled output. */
export const compileTs = async (
  args: readonly string[],
): Promise<void> => {
  await run('tsc', { args: ['-p', 'tsconfig.build.json', ...args] });
};

/** Runs ESLint with zero-warning threshold. */
export const lintEslint = async (
  args: readonly string[],
): Promise<void> => {
  await run('eslint', {
    args: ['--cache', '--cache-location', 'dist/.eslintcache', '--max-warnings=0', ...args],
  });
};

/** Runs oxlint with nested config disabled (per-package config is authoritative). */
export const lintOxlint = async (
  args: readonly string[],
): Promise<void> => {
  await run('oxlint', { args: ['--disable-nested-config', ...args] });
};

/** Runs all source tests via Vitest. */
export const testVitest = async (
  args: readonly string[],
): Promise<void> => {
  await run('vitest', { args: ['run', ...args] });
};

/** Runs fast source tests via Vitest (excludes tests tagged `slow`). */
export const testVitestFast = async (
  args: readonly string[],
): Promise<void> => {
  await run('vitest', { args: ['run', '--tags-filter=!slow', ...args] });
};

/** Runs slow source tests via Vitest (only tests tagged `slow`). */
export const testVitestSlow = async (
  args: readonly string[],
): Promise<void> => {
  await run('vitest', {
    args: ['run', '--tags-filter=slow', '--pass-with-no-tests', ...args],
  });
};

/** Runs end-to-end tests via Vitest with the e2e config. */
export const testVitestE2e = async (
  args: readonly string[],
): Promise<void> => {
  await run('vitest', {
    args: ['run', '--config', 'vitest.config.e2e.ts', ...args],
  });
};

/** Installs pre-commit hooks via prek. */
export const prepare = async (
  args: readonly string[],
): Promise<void> => {
  await run('prek', { args: ['install', ...args] });
};
