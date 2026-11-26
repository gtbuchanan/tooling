import { rm } from 'node:fs/promises';
import path from 'node:path';
import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';
import { eslintCache, findingsLog, formatterPath } from '#src/toolchains/eslint/paths.js';

/**
 * The ESLint CLI arguments `lint:eslint` runs with, the caller's last.
 */
export const lintEslintArgs = (rawArgs: readonly string[]): readonly string[] => [
  '--cache',
  '--cache-location',
  eslintCache,
  '--format',
  formatterPath,
  '--max-warnings=0',
  ...rawArgs,
];

/**
 * Runs ESLint from `cwd` through `runEslint`, first removing the previous
 * run's findings log. A run writing none, under a `--format` of the caller's
 * or a config error ESLint stops on before formatting, would otherwise leave
 * that log for turbo to cache as this run's output.
 */
export const executeLintEslint = async (
  cwd: string,
  rawArgs: readonly string[],
  runEslint: (args: readonly string[]) => Promise<void>,
): Promise<void> => {
  await rm(path.join(cwd, findingsLog), { force: true });
  await runEslint(lintEslintArgs(rawArgs));
};

/**
 * Runs ESLint with caching and zero-warning threshold, writing its findings
 * as a SARIF log beside the console report.
 */
export const lintEslint = defineCommand({
  meta: {
    description: 'Run ESLint with caching and --max-warnings=0, writing a SARIF log',
    name: lintEslintLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await executeLintEslint(process.cwd(), rawArgs, async (args) => {
      await run('eslint', { args });
    });
  },
});
