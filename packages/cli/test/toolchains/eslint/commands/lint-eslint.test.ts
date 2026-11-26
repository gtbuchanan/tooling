import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import {
  executeLintEslint,
  isPartialRun,
  lintEslintArgs,
} from '#src/toolchains/eslint/commands/lint-eslint.js';
import { findingsLog, formatterPath, partialRunEnv } from '#src/toolchains/eslint/paths.js';
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

  it('tells the formatter a run leaving findings out is partial', async ({ expect }) => {
    let runEnv: NodeJS.ProcessEnv = {};

    await executeLintEslint(createTempDir(), ['--quiet'], async (_args, env) => {
      runEnv = env;
      await Promise.resolve();
    }, {});

    expect(runEnv).toHaveProperty(partialRunEnv, 'true');
  });

  /*
   * A value inherited from an enclosing run, such as a script calling
   * `lint:eslint` from another narrowed one, says nothing about this run.
   */
  it('leaves a complete run unmarked whatever it inherits', async ({ expect }) => {
    const inherited = faker.lorem.word();
    let runEnv: NodeJS.ProcessEnv = {};

    await executeLintEslint(createTempDir(), [], async (_args, env) => {
      runEnv = env;
      await Promise.resolve();
    }, { [inherited]: inherited, [partialRunEnv]: 'true' });

    expect(runEnv).toStrictEqual({ [inherited]: inherited });
  });
});

/*
 * Only arguments known to keep every finding leave a run complete, so an
 * argument gtb doesn't recognize errs toward a log nothing counts from.
 */
describe.concurrent(isPartialRun, () => {
  it.for([
    [[]],
    [['.']],
    [['.', '--ignore-pattern', '"packages/*/**"']],
    [['--ignore-pattern="packages/*/**"']],
    [['--fix']],
    [['--fix-dry-run']],
    [['--fix-type', 'problem']],
    [['--fix-type=problem,suggestion']],
    [['--cache-location', 'other/.eslintcache']],
    [['--cache-strategy', 'content']],
    [['--concurrency', 'auto']],
    [['--color']],
    [['--no-color']],
    [['--debug']],
    [['--stats']],
  ] as const)('keeps every finding with %j', ([rawArgs], { expect }) => {
    expect(isPartialRun(rawArgs)).toBe(false);
  });

  it.for([
    [['--quiet']],
    [['src/index.ts']],
    [['.', 'src']],
    [['--fix', 'src']],
    [['--rule', 'no-var: off']],
    [['--no-config-lookup']],
  ] as const)('leaves findings out with %j', ([rawArgs], { expect }) => {
    expect(isPartialRun(rawArgs)).toBe(true);
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
