import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { executeLintEslint, lintEslintArgs } from '#src/toolchains/eslint/commands/lint-eslint.js';
import { findingsLog, formatterPath } from '#src/toolchains/eslint/paths.js';
import { createTempDir } from '#test/helpers.js';

describe.concurrent(executeLintEslint, () => {
  /*
   * A run that writes no log, under a `--format` of the caller's or a config
   * error, would otherwise leave the last run's log for turbo to cache as its
   * own.
   */
  it('removes the previous findings log before ESLint runs', async ({ expect }) => {
    const cwd = createTempDir();
    const log = path.join(cwd, findingsLog);
    mkdirSync(path.dirname(log), { recursive: true });
    writeFileSync(log, '{}');
    let isLogPresentAtRun: boolean | undefined;

    await executeLintEslint(cwd, [], async () => {
      isLogPresentAtRun = existsSync(log);
      await Promise.resolve();
    });

    expect(isLogPresentAtRun).toBe(false);
  });
});

describe.concurrent(lintEslintArgs, () => {
  it('formats the findings through gtb\'s formatter', ({ expect }) => {
    const args = lintEslintArgs([]);

    expect(args.slice(args.indexOf('--format'), args.indexOf('--format') + 2))
      .toStrictEqual(['--format', formatterPath]);
  });

  it('passes the caller\'s arguments after its own', ({ expect }) => {
    const rawArgs = [faker.system.fileName(), '--fix'];

    expect(lintEslintArgs(rawArgs).slice(-rawArgs.length)).toStrictEqual(rawArgs);
  });
});
