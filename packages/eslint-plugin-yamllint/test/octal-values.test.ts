import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { octalValues } from '#src/rules/octal-values.js';
import * as parser from './_parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

describe('yamllint/octal-values', () => {
  it('passes for regular numbers', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/octal-values', octalValues, {
        invalid: [],
        valid: [
          { code: 'key: 42\n' },
          { code: 'key: 0\n' },
          { code: 'key: 100\n' },
        ],
      });
    }).not.toThrow();
  });

  it('passes for quoted octal-like strings', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/octal-values', octalValues, {
        invalid: [],
        valid: [
          { code: 'key: "0777"\n' },
          { code: "key: '0o10'\n" },
        ],
      });
    }).not.toThrow();
  });

  it('flags implicit octal by default', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/octal-values', octalValues, {
        invalid: [
          {
            code: 'key: 0777\n',
            errors: [{ message: /octal/v }],
          },
          {
            code: 'key: 010\n',
            errors: [{ message: /octal/v }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags explicit octal by default', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/octal-values', octalValues, {
        invalid: [
          {
            code: 'key: 0o777\n',
            errors: [{ message: /octal/v }],
          },
          {
            code: 'key: 0o10\n',
            errors: [{ message: /octal/v }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('allows implicit octal when forbid-implicit-octal is false', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/octal-values', octalValues, {
        invalid: [],
        valid: [
          {
            code: 'key: 0777\n',
            options: [{ 'forbid-implicit-octal': false }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('allows explicit octal when forbid-explicit-octal is false', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/octal-values', octalValues, {
        invalid: [],
        valid: [
          {
            code: 'key: 0o777\n',
            options: [{ 'forbid-explicit-octal': false }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('does not flag non-octal zero-prefixed numbers', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/octal-values', octalValues, {
        invalid: [],
        valid: [
          { code: 'key: 0x1F\n' },
          { code: 'key: 0.5\n' },
        ],
      });
    }).not.toThrow();
  });
});
