import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { truthy } from '#src/rules/truthy.js';
import * as parser from './_parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

describe('yamllint/truthy', () => {
  it('passes for quoted boolean-like values', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [],
        valid: [
          { code: 'key: "yes"\n' },
          { code: "key: 'true'\n" },
          { code: 'key: "on"\n' },
          { code: "key: 'no'\n" },
        ],
      });
    }).not.toThrow();
  });

  it('passes for non-boolean plain scalars', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [],
        valid: [
          { code: 'key: hello\n' },
          { code: 'key: 42\n' },
          { code: 'key: null\n' },
        ],
      });
    }).not.toThrow();
  });

  it('flags unquoted yes/no', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'key: yes\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "yes"\n',
          },
          {
            code: 'key: no\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "no"\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags unquoted on/off', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'key: on\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "on"\n',
          },
          {
            code: 'key: off\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "off"\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags unquoted true/false', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'key: true\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "true"\n',
          },
          {
            code: 'key: false\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "false"\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags case variants', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'key: YES\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "YES"\n',
          },
          {
            code: 'key: True\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "True"\n',
          },
          {
            code: 'key: NO\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "NO"\n',
          },
          {
            code: 'key: False\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "False"\n',
          },
          {
            code: 'key: ON\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "ON"\n',
          },
          {
            code: 'key: OFF\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "OFF"\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags single-letter y/Y/n/N', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'key: y\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "y"\n',
          },
          {
            code: 'key: Y\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "Y"\n',
          },
          {
            code: 'key: n\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "n"\n',
          },
          {
            code: 'key: N\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "N"\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('does not flag keys by default', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [],
        valid: [
          { code: 'yes: value\n' },
          { code: 'on: value\n' },
        ],
      });
    }).not.toThrow();
  });

  it('flags keys when check-keys is true', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'yes: value\n',
            errors: [{ message: /truthy/v }],
            options: [{ 'check-keys': true }],
            output: '"yes": value\n',
          },
          {
            code: 'on: value\n',
            errors: [{ message: /truthy/v }],
            options: [{ 'check-keys': true }],
            output: '"on": value\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('respects allowed-values', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'key: yes\n',
            errors: [{ message: /truthy/v }],
            options: [{ 'allowed-values': ['true', 'false'] }],
            output: 'key: "yes"\n',
          },
        ],
        valid: [
          {
            code: 'key: true\n',
            options: [{ 'allowed-values': ['true', 'false'] }],
          },
          {
            code: 'key: false\n',
            options: [{ 'allowed-values': ['true', 'false'] }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('applies autofix by quoting the value', ({ expect }) => {
    expect(() => {
      ruleTester.run('yamllint/truthy', truthy, {
        invalid: [
          {
            code: 'key: yes\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "yes"\n',
          },
          {
            code: 'key: NO\n',
            errors: [{ message: /truthy/v }],
            output: 'key: "NO"\n',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });
});
