import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { lint } from '#src/lint.js';
import * as parser from '#src/parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

describe.concurrent('markdownlint/lint', () => {
  it('passes for clean markdown', ({ expect }) => {
    expect(() => {
      ruleTester.run('markdownlint/lint', lint, {
        invalid: [],
        valid: [
          { code: '# Title\n\nSome text.\n', options: [{ default: true }] },
        ],
      });
    }).not.toThrow();
  });

  it('detects duplicate headings (md024)', ({ expect }) => {
    expect(() => {
      ruleTester.run('markdownlint/lint', lint, {
        invalid: [
          {
            code: '# Title\n\n# Title\n',
            errors: [{ message: /MD024/v }, { message: /MD025/v }],
            options: [{ default: true }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('respects disabled rules', ({ expect }) => {
    expect(() => {
      ruleTester.run('markdownlint/lint', lint, {
        invalid: [],
        valid: [
          {
            code: '# Title\n\n# Title\n',
            options: [{
              'default': true,
              'no-duplicate-heading': false,
              'single-h1': false,
            }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('does not report rules disabled by prettier style', ({ expect }) => {
    /*
     * heading-style (md003) is disabled by markdownlint/style/prettier.
     * If Prettier conflicts are properly configured, mixing ATX and
     * setext headings should not produce violations.
     */
    expect(() => {
      ruleTester.run('markdownlint/lint', lint, {
        invalid: [],
        valid: [
          {
            code: '# ATX heading\n\nSetext heading\n---\n',
            options: [{
              'default': true,
              'first-line-heading': false,
              'heading-style': false,
            }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('applies autofix for fixable rules', ({ expect }) => {
    expect(() => {
      ruleTester.run('markdownlint/lint', lint, {
        invalid: [
          {
            code: '#No space after hash\n',
            errors: [{ message: /MD018/v }],
            options: [{ 'default': false, 'no-missing-space-atx': true }],
            output: '# No space after hash\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });
});
