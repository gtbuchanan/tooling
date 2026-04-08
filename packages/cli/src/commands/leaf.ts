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

/** Runs unit tests via Vitest. */
export const testVitest = async (
  args: readonly string[],
): Promise<void> => {
  await run('vitest', { args: ['run', ...args] });
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
