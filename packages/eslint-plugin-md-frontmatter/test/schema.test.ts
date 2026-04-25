import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { schema } from '#src/rules/schema.js';
import * as parser from './parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

const testSchema = {
  $schema: 'https://json-schema.org/draft-07/schema',
  additionalProperties: false,
  properties: {
    description: { maxLength: 100, minLength: 1, type: 'string' },
    metadata: {
      additionalProperties: { type: 'string' },
      type: 'object',
    },
    name: {
      maxLength: 64,
      minLength: 1,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      type: 'string',
    },
  },
  required: ['name', 'description'],
  type: 'object',
} as const;

describe('md-frontmatter/schema', () => {
  it('passes for frontmatter that satisfies the schema', ({ expect }) => {
    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [],
        valid: [
          {
            code: '---\nname: example\ndescription: A description.\n---\n# Body\n',
            options: [{ schema: testSchema }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('flags missing frontmatter', ({ expect }) => {
    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [
          {
            code: '# No frontmatter\n',
            errors: [{ message: /must begin with YAML frontmatter/v }],
            options: [{ schema: testSchema }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags missing required property at root', ({ expect }) => {
    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [
          {
            code: '---\nname: example\n---\n# Body\n',
            errors: [
              {
                message: /`frontmatter` must have required property 'description'/v,
              },
            ],
            options: [{ schema: testSchema }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags pattern violation on a scalar value', ({ expect }) => {
    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [
          {
            code: '---\nname: BadName\ndescription: ok.\n---\n',
            errors: [{ message: /`frontmatter\.name` must match pattern/v }],
            options: [{ schema: testSchema }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags maxLength violation', ({ expect }) => {
    const description = 'a'.repeat(101);

    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [
          {
            code: `---\nname: ok\ndescription: ${description}\n---\n`,
            errors: [{
              message: /`frontmatter\.description`.*more than 100 characters/v,
            }],
            options: [{ schema: testSchema }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags additionalProperties at root', ({ expect }) => {
    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [
          {
            code: '---\nname: ok\ndescription: ok.\nunknown: 42\n---\n',
            errors: [
              {
                message: /`frontmatter\.unknown`.*NOT have additional properties/v,
              },
            ],
            options: [{ schema: testSchema }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags wrong type for nested property', ({ expect }) => {
    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [
          {
            code: '---\nname: ok\ndescription: ok.\nmetadata:\n  version: 1\n---\n',
            errors: [{
              message: /`frontmatter\.metadata\.version` must be string/v,
            }],
            options: [{ schema: testSchema }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('reports each violating constraint separately', ({ expect }) => {
    /*
     * `name: ""` violates both minLength (1) and pattern. With
     * `allErrors: true`, ajv reports both — verify both reach ESLint.
     */
    expect(() => {
      ruleTester.run('md-frontmatter/schema', schema, {
        invalid: [
          {
            code: '---\nname: ""\ndescription: ok.\n---\n',
            errors: [
              { message: /`frontmatter\.name`.*fewer than 1 characters/v },
              { message: /`frontmatter\.name` must match pattern/v },
            ],
            options: [{ schema: testSchema }],
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });
});
