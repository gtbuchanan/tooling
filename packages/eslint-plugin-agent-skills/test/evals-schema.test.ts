import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { evalsSchema } from '#src/rules/evals-schema.js';
import * as parser from './parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'evals-schema',
);
const evalsFile = (name: string): string =>
  path.join(fixturesDir, name, 'evals', 'evals.json');

/* RuleTester passes source text via `code`; loading from disk keeps
   the fixture the single source of truth so what ESLint sees matches
   what the rule reads via fs for cross-file checks. */
const codeFor = (name: string): string =>
  fs.readFileSync(evalsFile(name), 'utf8');

describe.concurrent('agent-skills/evals-schema', () => {
  it('passes for a valid evals.json with sequential ids', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/evals-schema', evalsSchema, {
        invalid: [],
        valid: [
          { code: codeFor('valid'), filename: evalsFile('valid') },
        ],
      });
    }).not.toThrow();
  });

  it('flags schema violations (missing required field)', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/evals-schema', evalsSchema, {
        invalid: [
          {
            code: codeFor('missing-field'),
            errors: [{ message: /expected_output/v }],
            filename: evalsFile('missing-field'),
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags duplicate ids', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/evals-schema', evalsSchema, {
        invalid: [
          {
            code: codeFor('duplicate-ids'),
            errors: [
              { message: /Eval `id` must be sequential.*expected 2, got 1/v },
              { message: /Duplicate eval `id`: 1/v },
            ],
            filename: evalsFile('duplicate-ids'),
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags non-sequential ids', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/evals-schema', evalsSchema, {
        invalid: [
          {
            code: codeFor('non-sequential-ids'),
            errors: [{ message: /expected 2, got 3/v }],
            filename: evalsFile('non-sequential-ids'),
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags skill_name mismatch against SKILL.md', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/evals-schema', evalsSchema, {
        invalid: [
          {
            code: codeFor('name-mismatch'),
            errors: [{
              message: /expected `name-mismatch`, got `wrong-name`/v,
            }],
            filename: evalsFile('name-mismatch'),
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags missing sibling SKILL.md', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/evals-schema', evalsSchema, {
        invalid: [
          {
            code: codeFor('no-skill'),
            errors: [{ message: /No sibling SKILL\.md found/v }],
            filename: evalsFile('no-skill'),
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });
});
