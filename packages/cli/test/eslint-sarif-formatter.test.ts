import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import eslintSarifFormatter, {
  type FormatterResult,
  formatConsole,
  sarifOutputPath,
} from '#src/lib/eslint-sarif-formatter.js';
import { parseSarifLog } from '#src/lib/sarif-compare.js';

describe.concurrent(formatConsole, () => {
  it('returns empty output for a clean run', ({ expect }) => {
    const clean: FormatterResult = { filePath: faker.system.filePath(), messages: [] };

    expect(formatConsole([clean])).toBe('');
  });

  it('renders one line per message plus a problem count', ({ expect }) => {
    const filePath = faker.system.filePath();
    const result: FormatterResult = {
      filePath,
      messages: [
        {
          column: 3, line: 2, message: 'Unexpected console statement.',
          ruleId: 'no-console', severity: 2,
        },
        {
          column: 1, line: 9, message: 'Missing JSDoc.',
          ruleId: 'jsdoc/require-jsdoc', severity: 1,
        },
      ],
    };

    const output = formatConsole([result]);

    expect(output).toContain(`${filePath}:2:3  error  Unexpected console statement.  no-console`);
    expect(output).toContain(`${filePath}:9:1  warning  Missing JSDoc.  jsdoc/require-jsdoc`);
    expect(output).toContain('✖ 2 problems');
  });

  it('labels a message with no rule as internal', ({ expect }) => {
    const result: FormatterResult = {
      filePath: faker.system.filePath(),
      messages: [{
        column: 0,
        line: 0,
        message: 'Parsing error',
        /* eslint-disable-next-line unicorn/no-null --
           ESLint reports a null ruleId for parse/internal errors; the
           test mirrors that external shape. */
        ruleId: null,
        severity: 2,
      }],
    };

    expect(formatConsole([result])).toContain('internal');
  });
});

describe.concurrent('eslintSarifFormatter', () => {
  it('writes a SARIF log under the context cwd and returns console output', ({
    expect,
  }) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'sarif-formatter-test-'));
    try {
      const filePath = faker.system.filePath();
      const results: FormatterResult[] = [{
        filePath,
        messages: [{
          column: 3,
          line: 2,
          message: 'Unexpected console statement.',
          ruleId: 'no-console',
          severity: 1,
        }],
      }];

      const output = eslintSarifFormatter(results, { cwd });

      expect(output).toContain('✖ 1 problem');

      const written = readFileSync(path.join(cwd, sarifOutputPath), 'utf8');
      const log = parseSarifLog(JSON.parse(written));

      expect(log.runs[0]?.results).toHaveLength(1);
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });
});
