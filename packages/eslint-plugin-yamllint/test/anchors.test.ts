import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { anchors } from '#src/rules/anchors.js';
import * as parser from './_parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

describe('yamllint/anchors', () => {
  it('passes for valid anchor/alias pairs', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [],
        valid: [
          { code: 'a: &anchor value\nb: *anchor\n' },
        ],
      });
    }).not.toThrow();
  });

  it('flags unused anchors', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [
          {
            code: 'a: &unused value\nb: other\n',
            errors: [{ message: /unused/v }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags duplicate anchors', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [
          {
            code: 'a: &dup one\nb: &dup two\nc: *dup\n',
            errors: [{ message: /duplicate/v }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags undeclared aliases', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [
          {
            code: 'a: *missing\n',
            errors: [{ message: /undeclared/v }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('allows unused anchors when forbid-unused-anchors is false', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [],
        valid: [
          {
            code: 'a: &unused value\n',
            options: [{ 'forbid-unused-anchors': false }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('allows duplicate anchors when forbid-duplicated-anchors is false', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [],
        valid: [
          {
            code: 'a: &dup one\nb: &dup two\nc: *dup\n',
            options: [{ 'forbid-duplicated-anchors': false }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('allows undeclared aliases when forbid-undeclared-aliases is false', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [],
        valid: [
          {
            code: 'a: *missing\n',
            options: [{ 'forbid-undeclared-aliases': false }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('handles anchors on maps and sequences', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/anchors', anchors, {
        invalid: [],
        valid: [
          { code: 'a: &map\n  x: 1\nb: *map\n' },
          { code: 'a: &seq\n  - 1\n  - 2\nb: *seq\n' },
        ],
      });
    }).not.toThrow();
  });
});
