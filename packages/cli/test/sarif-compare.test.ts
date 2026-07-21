import { describe, it } from 'vitest';
import {
  type NewFinding,
  executeSarifCompare,
  extractAllFindings,
  extractNewFindings,
  formatNewFindings,
  parseSarifLog,
} from '#src/lib/sarif-compare.js';
import type { WorkspaceContext } from '#src/lib/workspace.js';
import { sarifLog, sarifResult, stubDeps } from './sarif-compare.stub.ts';

describe.concurrent(extractNewFindings, () => {
  it('keeps only results the baseliner classified as new', ({ expect }) => {
    const newResult = sarifResult('new', { ruleId: 'no-console' });
    const log = sarifLog([
      sarifResult('unchanged'),
      sarifResult('updated'),
      newResult,
      sarifResult('absent'),
    ]);

    const findings = extractNewFindings(parseSarifLog(log));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'error', ruleId: 'no-console' });
  });

  it('exempts suppressed findings from the gate', ({ expect }) => {
    const log = parseSarifLog(sarifLog([
      sarifResult('new', { suppressions: [{ kind: 'inSource' }] }),
    ]));

    expect(extractNewFindings(log)).toHaveLength(0);
  });

  it('falls back to placeholders when location or rule is absent', ({ expect }) => {
    const log = parseSarifLog(sarifLog([
      { baselineState: 'new', message: { text: 'boom' } },
    ]));

    expect(extractNewFindings(log)).toStrictEqual([{
      column: undefined,
      level: 'error',
      line: undefined,
      message: 'boom',
      ruleId: 'internal',
      uri: '<unknown>',
    }]);
  });
});

describe.concurrent(extractAllFindings, () => {
  it('treats every unsuppressed result as new regardless of state', ({ expect }) => {
    const log = parseSarifLog(sarifLog([
      sarifResult('unchanged'),
      sarifResult('unchanged', { suppressions: [{ kind: 'inSource' }] }),
    ]));

    expect(extractAllFindings(log)).toHaveLength(1);
  });
});

describe.concurrent(formatNewFindings, () => {
  it('renders uri, position, level, message, and rule per line', ({ expect }) => {
    const finding: NewFinding = {
      column: 3,
      level: 'error',
      line: 7,
      message: 'Unexpected console statement.',
      ruleId: 'no-console',
      uri: 'file:///repo/src/app.js',
    };

    expect(formatNewFindings([finding])).toBe(
      'file:///repo/src/app.js:7:3  error  Unexpected console statement.  no-console',
    );
  });

  it('omits the position when the result has no region', ({ expect }) => {
    const finding: NewFinding = {
      column: undefined,
      level: 'warning',
      line: undefined,
      message: 'boom',
      ruleId: 'internal',
      uri: '<unknown>',
    };

    expect(formatNewFindings([finding])).toBe('<unknown>  warning  boom  internal');
  });
});

describe.concurrent(executeSarifCompare, () => {
  const workspace: WorkspaceContext = {
    packageDirs: ['/repo/packages/a'],
    packageGlobs: ['packages/*'],
    rootDir: '/repo',
  };
  const currentFiles = [
    '/repo/dist/sarif/eslint.sarif',
    '/repo/dist/sarif/base/eslint.sarif',
    '/repo/packages/a/dist/sarif/eslint.sarif',
    '/repo/packages/a/dist/sarif/base/eslint.sarif',
  ];

  it('matches every SARIF log forward against its baseline', async ({ expect }) => {
    const { deps, runCalls } = stubDeps(workspace, currentFiles, sarifLog([]));

    await executeSarifCompare({}, deps);

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

    await executeSarifCompare({}, deps);

    expect(infos).toContain('No new findings');
  });

  it('rejects when any result is new', async ({ expect }) => {
    const { deps } = stubDeps(workspace, currentFiles, sarifLog([sarifResult('new')]));

    await expect(executeSarifCompare({}, deps)).rejects.toThrow(/new finding/v);
  });

  it('skips dirs with no current SARIF logs', async ({ expect }) => {
    const { deps, runCalls } = stubDeps(workspace, [], sarifLog([]));

    await executeSarifCompare({}, deps);

    expect(runCalls).toHaveLength(0);
  });

  it('treats a missing baseline as empty: all findings are new', async ({
    expect,
  }) => {
    const { deps, errors, runCalls } = stubDeps(
      workspace,
      ['/repo/dist/sarif/eslint.sarif'],
      sarifLog([sarifResult('unchanged')]),
    );

    await expect(executeSarifCompare({}, deps)).rejects.toThrow(/new finding/v);
    expect(runCalls).toHaveLength(0);
    expect(errors.some(line => line.includes('all findings are new'))).toBe(true);
  });

  it('passes with a missing baseline when the log is clean', async ({ expect }) => {
    const { deps, infos } = stubDeps(
      workspace,
      ['/repo/dist/sarif/eslint.sarif'],
      sarifLog([sarifResult('unchanged', { suppressions: [{ kind: 'inSource' }] })]),
    );

    await executeSarifCompare({}, deps);

    expect(infos).toContain('No new findings');
  });
});
