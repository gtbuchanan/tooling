import { Linter } from 'eslint';
import { describe, it } from 'vitest';
import { configure } from '#src/index.js';

const skillFile = 'skills/my-skill/SKILL.md';

/** Wraps extra frontmatter lines in an otherwise spec-valid `SKILL.md`. */
const skill = (...extra: readonly string[]): string => [
  '---',
  'name: my-skill',
  'description: A skill.',
  ...extra,
  '---',
  '',
  '# My skill',
  '',
].join('\n');

const teamExtensions = { 'x-team-owner': { type: 'string' } };

const schemaMessages = (
  configs: Linter.Config[],
  code: string,
): Linter.LintMessage[] => new Linter()
  .verify(code, configs, skillFile)
  .filter(message => message.ruleId === 'md-frontmatter/schema');

describe.concurrent('agentSkillsHost', () => {
  it('rejects host frontmatter fields by default', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });

    const [message, ...rest] = schemaMessages(
      configs,
      skill('user-invocable: false'),
    );

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/user-invocable.*additional properties/v);
  });

  it('accepts a named host\'s fields', async ({ expect }) => {
    const configs = await configure({
      agentSkillsHost: 'claude-code',
      onlyWarn: false,
    });

    expect(schemaMessages(configs, skill('user-invocable: false')))
      .toStrictEqual([]);
  });

  it('accepts fields from every host listed at once', async ({ expect }) => {
    const configs = await configure({
      agentSkillsHost: ['claude-code', teamExtensions],
      onlyWarn: false,
    });
    const code = skill('user-invocable: false', 'x-team-owner: platform');

    expect(schemaMessages(configs, code)).toStrictEqual([]);
  });

  it('rejects a field no listed host declares', async ({ expect }) => {
    const configs = await configure({
      agentSkillsHost: ['claude-code', teamExtensions],
      onlyWarn: false,
    });

    const [message, ...rest] = schemaMessages(
      configs,
      skill('x-team-lead: platform'),
    );

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/additional properties/v);
  });

  it('keeps the spec constraints a host does not mention', async ({ expect }) => {
    const configs = await configure({
      agentSkillsHost: 'claude-code',
      onlyWarn: false,
    });
    const code = '---\nname: my-skill\n---\n\n# My skill\n';

    const [message, ...rest] = schemaMessages(configs, code);

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/description/v);
  });
});
