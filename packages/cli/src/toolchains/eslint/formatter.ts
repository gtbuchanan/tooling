import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ESLint } from 'eslint';
import { jsonContent } from '#src/core/file-writer.js';
import { execute } from '#src/core/process.js';
import { findingsLog } from '#src/toolchains/eslint/paths.js';
import { toSarifLog } from '#src/toolchains/eslint/sarif.js';

/*
 * Spawning a missing binary rejects with `ENOENT` rather than exiting
 * non-zero, and a machine without git has no repository to be the root of.
 */
const isNotFound = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * The git checkout's root, which code scanning resolves `SRCROOT` to. The
 * pnpm workspace root can sit below it, or hold no packages at all, so it
 * would place a finding under the wrong directory. Outside a git repository
 * the linted directory stands in.
 *
 * Resolved from `cwd` through `--show-cdup` rather than read whole from
 * `--show-toplevel`, which gives the real path: ESLint names files by `cwd`
 * as given, and where that runs through a link (macOS's `/var` is
 * `/private/var`) the two would never share a prefix.
 */
export const repositoryRoot = async (
  cwd: string,
  runGit: typeof execute = execute,
): Promise<string> => {
  try {
    const { exitCode, stdout } = await runGit('git', ['rev-parse', '--show-cdup'], { cwd });

    return exitCode === 0 ? path.resolve(cwd, stdout) : cwd;
  } catch (error) {
    if (isNotFound(error)) {
      return cwd;
    }
    throw error;
  }
};

/*
 * The log is written before ESLint decides the exit code, so a run failing on
 * its findings still leaves them on disk for the steps reading them.
 */
const writeFindingsLog = async (
  results: readonly ESLint.LintResult[],
  { cwd, rulesMeta }: ESLint.LintResultData,
): Promise<void> => {
  const file = path.join(cwd, findingsLog);
  const log = toSarifLog(results, { rootDir: await repositoryRoot(cwd), rulesMeta });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, jsonContent(log));
};

/**
 * ESLint formatter writing the findings as a SARIF log and returning them for
 * the console in ESLint's own `stylish` layout.
 *
 * ESLint accepts one `--format`, so this one formatter does both, keeping
 * `lint:eslint` on the ESLint CLI and every flag it accepts.
 */
const format = async (
  results: ESLint.LintResult[],
  context: ESLint.LintResultData,
): Promise<string> => {
  await writeFindingsLog(results, context);
  const stylish = await new ESLint({ cwd: context.cwd }).loadFormatter('stylish');

  return await stylish.format(results, context);
};

export default format;
