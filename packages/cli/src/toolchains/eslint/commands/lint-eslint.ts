import { rm } from 'node:fs/promises';
import path from 'node:path';
import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';
import {
  eslintCache,
  findingsLog,
  formatterPath,
  partialRunEnv,
} from '#src/toolchains/eslint/paths.js';

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

/*
 * The caller's arguments known to keep every finding of the package. A fix
 * changes the findings, but the log still holds every one that remains.
 */
const completeFlags = new Set([
  '--color',
  '--debug',
  '--fix',
  '--fix-dry-run',
  '--no-color',
  '--stats',
]);

/*
 * Options of the same kind, taking a value. `--ignore-pattern` is how the
 * root's own script leaves the packages linting themselves to them, so the
 * files it ignores are no part of the root's findings.
 */
const completeOptions = new Set([
  '--cache-location',
  '--cache-strategy',
  '--concurrency',
  '--fix-type',
  '--ignore-pattern',
]);

/**
 * Whether the caller's arguments leave findings out of the run, as `--quiet`
 * or a list of files does. Only arguments known to keep every finding leave
 * the run complete: telling a file from an option's value takes ESLint's
 * whole option table, which it doesn't export, so an argument gtb doesn't
 * recognize marks the run partial rather than risk a missing finding reading
 * as a fixed one. `.` is the root's own target.
 */
export const isPartialRun = (rawArgs: readonly string[]): boolean => {
  const [arg, ...rest] = rawArgs;
  if (arg === undefined) {
    return false;
  }
  const separator = arg.indexOf('=');
  if (separator === -1 && (arg === '.' || completeFlags.has(arg))) {
    return isPartialRun(rest);
  }
  const name = separator === -1 ? arg : arg.slice(0, separator);

  return !completeOptions.has(name) || isPartialRun(separator === -1 ? rest.slice(1) : rest);
};

/*
 * The environment ESLint runs in. A partial marking inherited from an
 * enclosing run says nothing about this one, so it's replaced either way.
 */
const eslintEnv = (rawArgs: readonly string[], env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const inherited = Object.fromEntries(
    Object.entries(env).filter(([name]) => name !== partialRunEnv),
  );

  return isPartialRun(rawArgs) ? { ...inherited, [partialRunEnv]: 'true' } : inherited;
};

/**
 * Runs ESLint from `cwd` through `runEslint`, first removing the previous
 * run's findings log. A run writing none, under a `--format` of the caller's
 * or a config error ESLint stops on before formatting, would otherwise leave
 * that log for turbo to cache as this run's output.
 */
export const executeLintEslint = async (
  cwd: string,
  rawArgs: readonly string[],
  runEslint: (args: readonly string[], env: NodeJS.ProcessEnv) => Promise<void>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => {
  await rm(path.join(cwd, findingsLog), { force: true });
  await runEslint(lintEslintArgs(rawArgs), eslintEnv(rawArgs, env));
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
    await executeLintEslint(process.cwd(), rawArgs, async (args, env) => {
      await run('eslint', { args, env });
    });
  },
});
