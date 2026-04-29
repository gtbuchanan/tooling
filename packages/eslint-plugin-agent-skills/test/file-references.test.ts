import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdown from '@eslint/markdown';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { fileReferences } from '#src/rules/file-references.js';

const ruleTester = new RuleTester({
  language: 'markdown/commonmark',
  plugins: { markdown },
});

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'file-references',
);
const validSkill = path.join(fixturesDir, 'valid-skill', 'SKILL.md');
const deepSkill = path.join(fixturesDir, 'deep-skill', 'SKILL.md');

describe.concurrent('agent-skills/file-references', () => {
  it('passes when all referenced files exist within the skill root', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code:
              '# Body\n\n' +
              'See [the reference](references/REFERENCE.md) for details.\n\n' +
              'Run [the script](scripts/run.py).\n\n' +
              '![Diagram](assets/diagram.svg)\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });

  it('flags references to files that do not exist', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [
          {
            code: '# Body\n\nSee [missing](references/MISSING.md).\n',
            errors: [{
              message: /not found.*references\/MISSING\.md/v,
            }],
            filename: validSkill,
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('flags references that exceed the depth cap', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [
          {
            code: '# Body\n\n![deep](assets/img/deep.svg)\n',
            errors: [{
              message: /2 levels deep.*at most 1/v,
            }],
            filename: deepSkill,
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('respects a custom maxDepth option', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code: '# Body\n\n![deep](assets/img/deep.svg)\n',
            filename: deepSkill,
            options: [{ maxDepth: 2 }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('flags references that escape the skill root', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [
          {
            code: '# Body\n\n[escape](../valid-skill/references/REFERENCE.md)\n',
            errors: [{ message: /resolves outside the skill root/v }],
            filename: validSkill,
          },
        ],
        valid: [],
      });
    }).not.toThrow();
  });

  it('ignores external URLs and pure fragments', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code:
              '# Body\n\n' +
              '[abs](https://example.com/x)\n' +
              '[mail](mailto:x@example.com)\n' +
              '[anchor](#section)\n' +
              '[proto](//example.com/x)\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });

  it('strips fragments and queries before checking existence', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code: '# Body\n\n[ref](references/REFERENCE.md#heading?q=1)\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });

  it('skips links inside fenced code blocks', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code:
              '# Body\n\n' +
              '```markdown\n' +
              '[fake](references/MISSING.md)\n' +
              '```\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });

  it('skips links inside inline code spans', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code: '# Body\n\nUse `[fake](references/MISSING.md)` literally.\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });

  it('skips links inside HTML comments', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code:
              '# Body\n\n<!-- [fake](references/MISSING.md) -->\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });

  it('checks reference-style link definitions', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [
          {
            code:
              '# Body\n\nSee [the ref][1].\n\n' +
              '[1]: references/MISSING.md\n',
            errors: [{ message: /not found/v }],
            filename: validSkill,
          },
        ],
        valid: [
          {
            code:
              '# Body\n\nSee [the ref][1].\n\n' +
              '[1]: references/REFERENCE.md\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });

  it('skips when there is no markdown body', ({ expect }) => {
    expect(() => {
      ruleTester.run('agent-skills/file-references', fileReferences, {
        invalid: [],
        valid: [
          {
            code: '---\nname: valid-skill\ndescription: ok.\n---\n',
            filename: validSkill,
          },
        ],
      });
    }).not.toThrow();
  });
});
