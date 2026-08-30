import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { maxTokens } from '#src/rules/max-tokens.js';
import * as parser from './parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

const frontmatter = '---\nname: my-skill\ndescription: ok.\n---\n';

/* One estimated token per 4 characters, so a body of `4 * count`
   characters lands exactly on `count`. Uses a repeated 4-character
   run rather than generated prose so the character count is exact
   regardless of what the words are. */
const body = (tokenCount: number): string => 'word'.repeat(tokenCount);

describe.concurrent('agent-skills/max-tokens', () => {
  it('passes when the body is at the limit', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-tokens', maxTokens, {
        invalid: [],
        valid: [
          {
            code: frontmatter + body(5000),
            filename: '/repo/skills/my-skill/SKILL.md',
          },
        ],
      });
    }).not.toThrow();
  });

  it('flags when the body exceeds the limit', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-tokens', maxTokens, {
        invalid: [
          {
            code: frontmatter + body(5000) + 'over',
            errors: [{ message: /~5001 tokens.*recommended is 5000/v }],
            filename: '/repo/skills/my-skill/SKILL.md',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('honors an explicit max option', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-tokens', maxTokens, {
        invalid: [
          {
            code: frontmatter + body(11),
            errors: [{ message: /~11 tokens.*recommended is 10/v }],
            filename: '/repo/skills/my-skill/SKILL.md',
            options: [{ max: 10 }],
          },
        ],
        valid: [
          {
            code: frontmatter + body(10),
            filename: '/repo/skills/my-skill/SKILL.md',
            options: [{ max: 10 }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('excludes frontmatter from the count', ({ expect }) => {
    /* Frontmatter alone is well past a 10-token budget, so a rule
       counting the whole file would flag this. Only the body counts. */
    const wordy =
      '---\nname: my-skill\ndescription: ' +
      'A description long enough to blow the budget on its own.\n---\n';

    expect(() => {
      ruleTester.run('agent-skills/max-tokens', maxTokens, {
        invalid: [],
        valid: [
          {
            code: wordy + body(10),
            filename: '/repo/skills/my-skill/SKILL.md',
            options: [{ max: 10 }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('counts the whole file when there is no frontmatter', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/max-tokens', maxTokens, {
        invalid: [
          {
            code: body(11),
            errors: [{ message: /~11 tokens/v }],
            filename: '/repo/skills/my-skill/SKILL.md',
            options: [{ max: 10 }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('reports from where the budget is exceeded to end of file', ({ expect }) => {
    /* Budget of 1 token = 4 body characters, so the report starts at
       the 5th body character. The body begins on line 5 (frontmatter
       occupies lines 1-4), spread over two lines to prove the
       location tracks lines rather than raw offsets. */
    expect(() => {
      ruleTester.run('agent-skills/max-tokens', maxTokens, {
        invalid: [
          {
            code: `${frontmatter}abcd\nefgh`,
            errors: [{
              column: 5,
              endColumn: 5,
              endLine: 6,
              line: 5,
              messageId: 'tooManyTokens',
            }],
            filename: '/repo/skills/my-skill/SKILL.md',
            options: [{ max: 1 }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });
});
