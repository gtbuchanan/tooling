import { run } from '../lib/process.ts';

/** Runs `tsc -b` with optional pass-through args. */
export const compileTs = async (
  args: readonly string[],
): Promise<void> => {
  await run('tsc', { args: ['-b', ...args] });
};

/** Runs ESLint with zero-warning threshold. */
export const lintEslint = async (
  args: readonly string[],
): Promise<void> => {
  await run('eslint', { args: ['--max-warnings=0', ...args] });
};

/** Runs oxlint. */
export const lintOxlint = async (
  args: readonly string[],
): Promise<void> => {
  await run('oxlint', { args });
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

/** Runs per-package generate scripts (code generation, i18n compilation, etc.). */
export const generate = async (
  args: readonly string[],
): Promise<void> => {
  await run('pnpm', { args: ['-r', '--if-present', 'run', 'generate', ...args] });
};

/** Installs pre-commit hooks via prek. */
export const prepare = async (
  args: readonly string[],
): Promise<void> => {
  await run('prek', { args: ['install', ...args] });
};
