import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { minEvals } from '#src/rules/min-evals.js';
import * as parser from './parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'min-evals',
);
const skillFile = (name: string): string =>
  path.join(fixturesDir, name, 'SKILL.md');

describe.concurrent('agent-skills/min-evals', () => {
  it('passes when evals.json has at least min cases', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/min-evals', minEvals, {
        invalid: [],
        valid: [
          { code: '# Body\n', filename: skillFile('one-eval') },
        ],
      });
    }).not.toThrow();
  });

  it('flags when evals/ directory is missing', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/min-evals', minEvals, {
        invalid: [
          {
            code: '# Body\n',
            errors: [{ message: /too few eval cases \(0\).*Minimum is 1/v }],
            filename: skillFile('no-evals'),
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags when evals array is empty', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/min-evals', minEvals, {
        invalid: [
          {
            code: '# Body\n',
            errors: [{ message: /too few eval cases \(0\).*Minimum is 1/v }],
            filename: skillFile('empty-evals'),
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('respects a custom min option', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/min-evals', minEvals, {
        invalid: [
          {
            code: '# Body\n',
            errors: [{ message: /too few eval cases \(1\).*Minimum is 3/v }],
            filename: skillFile('one-eval'),
            options: [{ min: 3 }],
          },
        ],
        valid: [
          {
            code: '# Body\n',
            filename: skillFile('three-evals'),
            options: [{ min: 3 }],
          },
        ],
      });
    }).not.toThrow();
  });
});
