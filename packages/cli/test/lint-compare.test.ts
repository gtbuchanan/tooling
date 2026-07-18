import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import {
  type LintCompareDeps,
  type NewViolation,
  executeLintEslintCompare,
  extractNewViolations,
  formatNewViolations,
  parseSarifLog,
  sarifFileNames,
} from '#src/lib/lint-compare.js';
import type { Logger } from '#src/lib/logger.js';
import type { WorkspaceContext } from '#src/lib/workspace.js';

const sarifResult = (baselineState: string, overrides?: {
  readonly ruleId?: string;
  readonly startLine?: number;
}): object => ({
  baselineState,
  level: 'error',
  locations: [{
    physicalLocation: {
      artifactLocation: { uri: faker.system.filePath() },
      region: { startColumn: 1, startLine: overrides?.startLine ?? 1 },
    },
  }],
  message: { text: faker.lorem.sentence() },
  ruleId: overrides?.ruleId ?? 'no-unused-vars',
});

const sarifLog = (results: readonly object[]): object => ({
  runs: [{ results }],
});

interface RunCall {
  readonly args: readonly string[];
  readonly command: string;
}

interface StubDeps {
  readonly deps: LintCompareDeps;
  readonly errors: readonly string[];
  readonly infos: readonly string[];
  readonly runCalls: readonly RunCall[];
}

const normalize = (filePath: string): string => filePath.replaceAll('\\', '/');

/**
 * Fakes a workspace whose SARIF files are the keys of `files`; reading
 * any matched path yields `matched`.
 */
const stubDeps = (
  workspace: WorkspaceContext,
  files: readonly string[],
  matched: object,
): StubDeps => {
  const errors: string[] = [];
  const infos: string[] = [];
  const runCalls: RunCall[] = [];
  const logger: Logger = {
    error: (...args) => void errors.push(args.join(' ')),
    info: (...args) => void infos.push(args.join(' ')),
  };
  return {
    deps: {
      exists: filePath => files.includes(normalize(filePath)),
      logger,
      readJson: () => matched,
      resolveMultitool: () => 'sarif-multitool',
      run: (command, options) => {
        runCalls.push({ args: options?.args ?? [], command });
        return Promise.resolve();
      },
      workspace: () => workspace,
    },
    errors,
    infos,
    runCalls,
  };
};

describe.concurrent(extractNewViolations, () => {
  it('keeps only results the baseliner classified as new', ({ expect }) => {
    const newResult = sarifResult('new', { ruleId: 'no-console' });
    const log = sarifLog([
      sarifResult('unchanged'),
      sarifResult('updated'),
      newResult,
      sarifResult('absent'),
    ]);

    const violations = extractNewViolations(parseSarifLog(log));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ level: 'error', ruleId: 'no-console' });
  });

  it('falls back to placeholders when location or rule is absent', ({ expect }) => {
    const log = parseSarifLog(sarifLog([
      { baselineState: 'new', message: { text: 'boom' } },
    ]));

    expect(extractNewViolations(log)).toStrictEqual([{
      column: undefined,
      level: 'error',
      line: undefined,
      message: 'boom',
      ruleId: 'internal',
      uri: '<unknown>',
    }]);
  });
});

describe.concurrent(formatNewViolations, () => {
  it('renders uri, position, level, message, and rule per line', ({ expect }) => {
    const violation: NewViolation = {
      column: 3,
      level: 'error',
      line: 7,
      message: 'Unexpected console statement.',
      ruleId: 'no-console',
      uri: 'file:///repo/src/app.js',
    };

    expect(formatNewViolations([violation])).toBe(
      'file:///repo/src/app.js:7:3  error  Unexpected console statement.  no-console',
    );
  });

  it('omits the position when the result has no region', ({ expect }) => {
    const violation: NewViolation = {
      column: undefined,
      level: 'warning',
      line: undefined,
      message: 'boom',
      ruleId: 'internal',
      uri: '<unknown>',
    };

    expect(formatNewViolations([violation])).toBe('<unknown>  warning  boom  internal');
  });
});

describe.concurrent(executeLintEslintCompare, () => {
  const workspace: WorkspaceContext = {
    packageDirs: ['/repo/packages/a'],
    packageGlobs: ['packages/*'],
    rootDir: '/repo',
  };
  const currentFiles = [
    `/repo/dist/${sarifFileNames.current}`,
    `/repo/dist/${sarifFileNames.base}`,
    `/repo/packages/a/dist/${sarifFileNames.current}`,
    `/repo/packages/a/dist/${sarifFileNames.base}`,
  ];

  it('matches every lint dir forward against its baseline', async ({ expect }) => {
    const { deps, runCalls } = stubDeps(workspace, currentFiles, sarifLog([]));

    await executeLintEslintCompare(deps);

    expect(runCalls).toHaveLength(2);
    expect(runCalls[0]).toMatchObject({ command: 'sarif-multitool' });
    expect(runCalls[0]?.args[0]).toBe('match-results-forward');
  });

  it('resolves and reports when no results are new', async ({ expect }) => {
    const { deps, infos } = stubDeps(
      workspace,
      currentFiles,
      sarifLog([sarifResult('unchanged'), sarifResult('updated')]),
    );

    await executeLintEslintCompare(deps);

    expect(infos).toContain('No new lint violations');
  });

  it('rejects when any result is new', async ({ expect }) => {
    const { deps } = stubDeps(workspace, currentFiles, sarifLog([sarifResult('new')]));

    await expect(executeLintEslintCompare(deps)).rejects.toThrow(
      /new lint violation/v,
    );
  });

  it('skips dirs with no current SARIF log', async ({ expect }) => {
    const { deps, runCalls } = stubDeps(workspace, [], sarifLog([]));

    await executeLintEslintCompare(deps);

    expect(runCalls).toHaveLength(0);
  });

  it('warns and skips dirs missing only the baseline', async ({ expect }) => {
    const { deps, errors, runCalls } = stubDeps(
      workspace,
      [`/repo/dist/${sarifFileNames.current}`],
      sarifLog([]),
    );

    await executeLintEslintCompare(deps);

    expect(runCalls).toHaveLength(0);
    expect(errors.some(line => line.includes('No baseline SARIF'))).toBe(true);
  });
});
