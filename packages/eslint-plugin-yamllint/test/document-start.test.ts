import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { documentStart } from '#src/rules/document-start.js';
import * as parser from './_parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

describe.concurrent('yamllint/document-start', () => {
  it('passes when marker is present and required', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-start', documentStart, {
        invalid: [],
        valid: [
          { code: '---\nkey: value\n' },
        ],
      });
    }).not.toThrow();
  });

  it('flags missing marker when required (default)', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-start', documentStart, {
        invalid: [
          {
            code: 'key: value\n',
            errors: [{ message: /document start/v }],
            output: '---\nkey: value\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags unwanted marker when present is false', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-start', documentStart, {
        invalid: [
          {
            code: '---\nkey: value\n',
            errors: [{ message: /document start/v }],
            options: [{ present: false }],
            output: 'key: value\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('passes when marker is absent and not required', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-start', documentStart, {
        invalid: [],
        valid: [
          {
            code: 'key: value\n',
            options: [{ present: false }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('handles multi-document files', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-start', documentStart, {
        invalid: [],
        valid: [
          { code: '---\ndoc1: a\n---\ndoc2: b\n' },
        ],
      });
    }).not.toThrow();
  });

  it('handles empty file', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-start', documentStart, {
        invalid: [],
        valid: [
          { code: '' },
          { code: '\n' },
        ],
      });
    }).not.toThrow();
  });
});
