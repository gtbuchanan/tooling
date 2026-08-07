import path from 'node:path';
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { plainText } from '#src/lib/finding-report.js';
import {
  type EslintConstructor,
  type EslintOptions,
  type EslintResult,
  type LintEslintDeps,
  executeLintEslint,
  parseLintEslintArgs,
  sarifOutputPath,
} from '#src/lib/lint-eslint.js';
import { parseSarifLog } from '#src/lib/sarif-log.js';
import { captureLogger, createTempDir } from './helpers.ts';

describe.concurrent(parseLintEslintArgs, () => {
  it('defaults to no patterns, no ignores, and no fix', ({ expect }) => {
    expect(parseLintEslintArgs([])).toStrictEqual({
      fix: false,
      ignorePatterns: [],
      patterns: [],
    });
  });

  it('collects positional arguments as lint patterns', ({ expect }) => {
    expect(parseLintEslintArgs(['src', 'test'])).toMatchObject({
      patterns: ['src', 'test'],
    });
  });

  it('enables fix mode via --fix', ({ expect }) => {
    expect(parseLintEslintArgs(['--fix'])).toMatchObject({ fix: true });
  });

  it('accepts --ignore-pattern in both spaced and equals forms', ({ expect }) => {
    const args = ['--ignore-pattern', 'packages/*/**', '--ignore-pattern=dist/**'];

    expect(parseLintEslintArgs(args)).toMatchObject({
      ignorePatterns: ['packages/*/**', 'dist/**'],
    });
  });

  it('rejects flags outside the supported surface', ({ expect }) => {
    expect(() => parseLintEslintArgs(['--max-warnings=0']))
      .toThrow('--max-warnings=0');
  });

  it('rejects a trailing --ignore-pattern with no value', ({ expect }) => {
    expect(() => parseLintEslintArgs(['--ignore-pattern']))
      .toThrow('--ignore-pattern');
  });
});

/** Builds an ESLint result in the subset shape the task consumes. */
const lintResult = (overrides?: Partial<EslintResult>): EslintResult => ({
  errorCount: 0,
  filePath: faker.system.filePath(),
  messages: [],
  ...overrides,
});

interface StubEslint {
  readonly Eslint: EslintConstructor;
  readonly ctorOptions: readonly EslintOptions[];
  readonly lintedPatterns: readonly (readonly string[])[];
  readonly outputFixesCalls: readonly (readonly EslintResult[])[];
}

const stubEslint = (results: EslintResult[]): StubEslint => {
  const ctorOptions: EslintOptions[] = [];
  const lintedPatterns: string[][] = [];
  const outputFixesCalls: EslintResult[][] = [];
  class Eslint {
    public static outputFixes = (fixed: EslintResult[]): Promise<void> => {
      outputFixesCalls.push(fixed);
      return Promise.resolve();
    };

    private readonly results = results;

    private readonly rulesMeta = {};

    public constructor(options: EslintOptions) {
      ctorOptions.push(options);
    }

    public getRulesMetaForResults(): unknown {
      return this.rulesMeta;
    }

    public lintFiles(patterns: string[]): Promise<EslintResult[]> {
      lintedPatterns.push(patterns);
      return Promise.resolve(this.results);
    }
  }
  return { Eslint, ctorOptions, lintedPatterns, outputFixesCalls };
};

interface StubbedDeps {
  readonly cwd: string;
  readonly deps: LintEslintDeps;
  readonly out: () => string;
  readonly writes: readonly { content: string; filePath: string }[];
}

const stubDeps = (Eslint: EslintConstructor): StubbedDeps => {
  const cwd = createTempDir();
  const writes: { content: string; filePath: string }[] = [];
  const { logger, out } = captureLogger();
  return {
    cwd,
    deps: {
      cwd: () => cwd,
      loadEslint: () => Promise.resolve(Eslint),
      logger,
      style: plainText,
      writeFile: (filePath, content) => void writes.push({ content, filePath }),
    },
    out,
    writes,
  };
};

describe.concurrent(executeLintEslint, () => {
  it('lints the current directory with caching by default', async ({ expect }) => {
    const { Eslint, ctorOptions, lintedPatterns } = stubEslint([lintResult()]);
    const { deps } = stubDeps(Eslint);

    await executeLintEslint([], deps);

    expect(ctorOptions[0]).toStrictEqual({
      cache: true,
      cacheLocation: 'dist/.eslintcache',
      fix: false,
    });
    expect(lintedPatterns).toStrictEqual([['.']]);
  });

  it('forwards patterns and ignore patterns', async ({ expect }) => {
    const { Eslint, ctorOptions, lintedPatterns } = stubEslint([lintResult()]);
    const { deps } = stubDeps(Eslint);

    await executeLintEslint(['src', '--ignore-pattern', 'packages/*/**'], deps);

    expect(ctorOptions[0]).toMatchObject({ ignorePatterns: ['packages/*/**'] });
    expect(lintedPatterns).toStrictEqual([['src']]);
  });

  it('writes the SARIF log under the lint cwd', async ({ expect }) => {
    const { Eslint } = stubEslint([lintResult({
      messages: [{
        column: 3, line: 2, message: 'Unexpected console statement.',
        ruleId: 'no-console', severity: 1,
      }],
    })]);
    const { cwd, deps, writes } = stubDeps(Eslint);

    await executeLintEslint([], deps);

    expect(writes).toHaveLength(1);
    expect(writes[0]?.filePath).toBe(path.resolve(cwd, sarifOutputPath));

    const log = parseSarifLog(JSON.parse(writes[0]?.content ?? ''));

    expect(log.runs[0]?.results).toHaveLength(1);
  });

  it('prints a stylish report of the findings', async ({ expect }) => {
    const { Eslint } = stubEslint([lintResult({
      messages: [{
        column: 3, line: 2, message: 'Unexpected console statement.',
        ruleId: 'no-console', severity: 1,
      }],
    })]);
    const { deps, out } = stubDeps(Eslint);

    await executeLintEslint([], deps);

    expect(out()).toContain('warning  Unexpected console statement.  no-console');
    expect(out()).toContain('✖ 1 problem (0 errors, 1 warning)');
  });

  it('prints nothing for a clean run', async ({ expect }) => {
    const { Eslint } = stubEslint([lintResult()]);
    const { deps, out } = stubDeps(Eslint);

    await executeLintEslint([], deps);

    expect(out()).toBe('');
  });

  it('labels a message with no rule as internal', async ({ expect }) => {
    const { Eslint } = stubEslint([lintResult({
      messages: [{
        column: 0,
        line: 0,
        message: 'Parsing error',
        /* eslint-disable-next-line unicorn/no-null --
           ESLint reports a null ruleId for parse/internal errors; the
           test mirrors that external shape. */
        ruleId: null,
        severity: 1,
      }],
    })]);
    const { deps, out } = stubDeps(Eslint);

    await executeLintEslint([], deps);

    expect(out()).toContain('internal');
  });

  it('rejects on lint errors after writing the SARIF log', async ({ expect }) => {
    const { Eslint } = stubEslint([lintResult({
      errorCount: 2,
      messages: [
        { column: 1, line: 1, message: 'boom', ruleId: 'no-console', severity: 2 },
        { column: 1, line: 2, message: 'bang', ruleId: 'no-alert', severity: 2 },
      ],
    })]);
    const { deps, writes } = stubDeps(Eslint);

    await expect(executeLintEslint([], deps)).rejects.toThrow('2 errors');
    expect(writes).toHaveLength(1);
  });

  it('writes fixes through outputFixes in fix mode', async ({ expect }) => {
    const results = [lintResult()];
    const { Eslint, ctorOptions, outputFixesCalls } = stubEslint(results);
    const { deps } = stubDeps(Eslint);

    await executeLintEslint(['--fix'], deps);

    expect(ctorOptions[0]).toMatchObject({ fix: true });
    expect(outputFixesCalls).toStrictEqual([results]);
  });

  it('leaves fixes unwritten outside fix mode', async ({ expect }) => {
    const { Eslint, outputFixesCalls } = stubEslint([lintResult()]);
    const { deps } = stubDeps(Eslint);

    await executeLintEslint([], deps);

    expect(outputFixesCalls).toHaveLength(0);
  });
});
