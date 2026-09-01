import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { maxLines } from '#src/rules/max-lines.js';
import * as parser from './parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

const filename = '/repo/skills/my-skill/SKILL.md';

/* Numbered so a miscount shows up as the wrong number in the message
   rather than as an off-by-one nobody can see. */
const body = (lineCount: number): string => Array
  .from({ length: lineCount }, (_unused, index) => `Line ${(index + 1).toString()}.`)
  .join('\n');

describe.concurrent('agent-skills/max-lines', () => {
  it('passes when the file is at the limit', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-lines', maxLines, {
        invalid: [],
        valid: [{ code: body(500), filename }],
      });
    }).not.toThrow();
  });

  it('flags when the file exceeds the limit', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-lines', maxLines, {
        invalid: [
          {
            code: body(501),
            errors: [{ message: /501.*Maximum allowed is 500/v }],
            filename,
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('honors an explicit max option', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-lines', maxLines, {
        invalid: [
          {
            code: body(11),
            errors: [{ message: /11.*Maximum allowed is 10/v }],
            filename,
            options: [{ max: 10 }],
          },
        ],
        valid: [{ code: body(10), filename, options: [{ max: 10 }] }],
      });
    }).not.toThrow();
  });

  /* Unlike core's `max-lines`, this rule takes the file's physical line
     count — there is no `skipBlankLines`/`skipComments` equivalent, so
     structural lines are counted like any other. */
  it('counts blank lines', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-lines', maxLines, {
        invalid: [
          {
            code: '\n'.repeat(10),
            errors: [{ message: /11.*Maximum allowed is 10/v }],
            filename,
            options: [{ max: 10 }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('reports from the first line past the limit to end of file', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-lines', maxLines, {
        invalid: [
          {
            code: 'a\nb\nc',
            errors: [{
              column: 1,
              endColumn: 2,
              endLine: 3,
              line: 3,
              messageId: 'tooLong',
            }],
            filename,
            options: [{ max: 2 }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });
});
