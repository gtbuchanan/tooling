import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import {
  type FormatterResult,
  formatConsole,
} from '#src/lib/eslint-sarif-formatter.js';

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
