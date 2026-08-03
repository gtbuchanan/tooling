import { describe, it } from 'vitest';
import {
  type Finding,
  type StyleText,
  formatFindingReport,
} from '#src/lib/finding-report.js';

const finding = (overrides: Partial<Finding>): Finding => ({
  column: 1,
  level: 'error',
  line: 1,
  message: 'boom',
  ruleId: 'internal',
  uri: 'src/app.ts',
  ...overrides,
});

/** Tags each styled part so assertions can see where styles landed. */
const markerStyle: StyleText = (format, text) => `«${format}»${text}`;

describe.concurrent(formatFindingReport, () => {
  it('returns empty output for no findings', ({ expect }) => {
    expect(formatFindingReport([])).toBe('');
  });

  it('aligns columns per file and appends a summary', ({ expect }) => {
    const findings = [
      finding({
        column: 10, level: 'error', line: 1,
        message: 'Unexpected console statement.', ruleId: 'no-console',
      }),
      finding({
        column: 2, level: 'warning', line: 22,
        message: 'Missing JSDoc.', ruleId: 'jsdoc/require-jsdoc',
      }),
    ];

    expect(formatFindingReport(findings)).toBe([
      'src/app.ts',
      '   1:10  error    Unexpected console statement.  no-console',
      '  22:2   warning  Missing JSDoc.                 jsdoc/require-jsdoc',
      '',
      '✖ 2 problems (1 error, 1 warning)',
    ].join('\n'));
  });

  it('groups findings by file in first-appearance order', ({ expect }) => {
    const findings = [
      finding({ message: 'first', ruleId: 'rule-a', uri: 'b.ts' }),
      finding({ level: 'warning', message: 'second', ruleId: 'rule-b', uri: 'a.ts' }),
      finding({ message: 'third', ruleId: 'rule-c', uri: 'b.ts' }),
    ];

    expect(formatFindingReport(findings)).toBe([
      'b.ts',
      '  1:1  error  first  rule-a',
      '  1:1  error  third  rule-c',
      '',
      'a.ts',
      '  1:1  warning  second  rule-b',
      '',
      '✖ 3 problems (2 errors, 1 warning)',
    ].join('\n'));
  });

  it('omits the position column when no finding has one', ({ expect }) => {
    const findings = [
      finding({ column: undefined, level: 'warning', line: undefined }),
    ];

    expect(formatFindingReport(findings)).toBe([
      'src/app.ts',
      '  warning  boom  internal',
      '',
      '✖ 1 problem (0 errors, 1 warning)',
    ].join('\n'));
  });

  it('renders a line-only position when the column is absent', ({ expect }) => {
    const findings = [finding({ column: undefined, line: 7 })];

    expect(formatFindingReport(findings)).toBe([
      'src/app.ts',
      '  7  error  boom  internal',
      '',
      '✖ 1 problem (1 error, 0 warnings)',
    ].join('\n'));
  });

  it('styles each report part through the given style', ({ expect }) => {
    const findings = [
      finding({ message: 'boom', ruleId: 'no-console' }),
      finding({ level: 'warning', message: 'hmmm', ruleId: 'no-alert' }),
    ];

    expect(formatFindingReport(findings, markerStyle)).toBe([
      '«underline»src/app.ts',
      '  «dim»1:1  «red»error    boom  «dim»no-console',
      '  «dim»1:1  «yellow»warning  hmmm  «dim»no-alert',
      '',
      '«bold»«red»✖ 2 problems (1 error, 1 warning)',
    ].join('\n'));
  });

  it('styles an error-free summary yellow', ({ expect }) => {
    const findings = [finding({ level: 'warning' })];

    expect(formatFindingReport(findings, markerStyle))
      .toContain('«bold»«yellow»✖ 1 problem (0 errors, 1 warning)');
  });
});
