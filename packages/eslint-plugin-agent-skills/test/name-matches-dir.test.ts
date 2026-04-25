import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { nameMatchesDir } from '#src/rules/name-matches-dir.js';
import * as parser from './parser.js';

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

describe('agent-skills/name-matches-dir', () => {
  it('passes when name matches the parent directory', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/name-matches-dir', nameMatchesDir, {
        invalid: [],
        valid: [
          {
            code: '---\nname: my-skill\ndescription: ok.\n---\n',
            filename: '/repo/skills/my-skill/SKILL.md',
          },
        ],
      });
    }).not.toThrow();
  });

  it('flags when name differs from the parent directory', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/name-matches-dir', nameMatchesDir, {
        invalid: [
          {
            code: '---\nname: wrong-name\ndescription: ok.\n---\n',
            errors: [{
              message: /expected `my-skill`, got `wrong-name`/v,
            }],
            filename: '/repo/skills/my-skill/SKILL.md',
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('skips when there is no frontmatter', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/name-matches-dir', nameMatchesDir, {
        invalid: [],
        valid: [
          {
            code: '# No frontmatter\n',
            filename: '/repo/skills/foo/SKILL.md',
          },
        ],
      });
    }).not.toThrow();
  });

  it('skips when name field is absent', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/name-matches-dir', nameMatchesDir, {
        invalid: [],
        valid: [
          {
            code: '---\ndescription: ok.\n---\n',
            filename: '/repo/skills/foo/SKILL.md',
          },
        ],
      });
    }).not.toThrow();
  });
});
