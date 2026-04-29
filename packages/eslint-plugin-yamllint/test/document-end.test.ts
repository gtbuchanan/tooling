import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { documentEnd } from '#src/rules/document-end.js';
import * as parser from './_parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

describe.concurrent('yamllint/document-end', () => {
  it('passes when marker is absent and forbidden (default)', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-end', documentEnd, {
        invalid: [],
        valid: [
          { code: '---\nkey: value\n' },
        ],
      });
    }).not.toThrow();
  });

  it('flags unwanted marker when forbidden (default)', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-end', documentEnd, {
        invalid: [
          {
            code: '---\nkey: value\n...\n',
            errors: [{ message: /document end/v }],
            output: '---\nkey: value\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags missing marker when required', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-end', documentEnd, {
        invalid: [
          {
            code: '---\nkey: value\n',
            errors: [{ message: /document end/v }],
            options: [{ present: true }],
            output: '---\nkey: value\n...\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('passes when marker is present and required', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-end', documentEnd, {
        invalid: [],
        valid: [
          {
            code: '---\nkey: value\n...\n',
            options: [{ present: true }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('handles empty file', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/document-end', documentEnd, {
        invalid: [],
        valid: [
          { code: '' },
          { code: '\n' },
        ],
      });
    }).not.toThrow();
  });
});
