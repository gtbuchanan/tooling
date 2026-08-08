import path from 'node:path';
import { Linter } from 'eslint';
import { describe, it } from 'vitest';
import { configs, defineSkillFrontmatterConfig } from '#src/index.js';

const cwd = path.resolve('/repo');
const skillFile = path.join(cwd, 'skills', 'my-skill', 'SKILL.md');

const linter = new Linter({ cwd });
const spec = [...configs.recommended];
const claudeCode = [
  ...configs.recommended,
  ...defineSkillFrontmatterConfig('claude-code'),
];

/**
 * Wraps extra frontmatter lines in an otherwise spec-valid `SKILL.md`.
 */
const skill = (extra = ''): string =>
  `---\nname: my-skill\ndescription: A skill.\n${extra}---\n\n# My skill\n`;

const schemaMessages = (
  config: readonly Linter.Config[],
  code: string,
): readonly Linter.LintMessage[] => linter
  .verify(code, [...config], skillFile)
  .filter(message => message.ruleId === 'md-frontmatter/schema');

/*
 * Every field in Claude Code's frontmatter reference table
 * (https://code.claude.com/docs/en/skills), exercising the list form of
 * each field that documents both a scalar and a YAML-list spelling.
 */
const everyClaudeCodeField = [
  'agent: general-purpose',
  'allowed-tools:',
  '  - Read',
  '  - Grep',
  "argument-hint: '[issue-number]'",
  'arguments:',
  '  - issue',
  '  - branch',
  'background: false',
  'context: fork',
  'disable-model-invocation: true',
  'disallowed-tools: AskUserQuestion',
  'effort: high',
  'hooks:',
  '  PreToolUse:',
  '    - matcher: Bash',
  '      hooks:',
  '        - type: command',
  "          command: echo 'hi'",
  'model: inherit',
  'paths:',
  "  - 'src/**/*.ts'",
  'shell: powershell',
  'user-invocable: false',
  'when_to_use: When the user asks about issues.',
  '',
].join('\n');

describe('the claude-code frontmatter overlay', () => {
  it('accepts every documented Claude Code field', ({ expect }) => {
    const messages = schemaMessages(claudeCode, skill(everyClaudeCodeField));

    expect(messages).toStrictEqual([]);
  });

  it('accepts the spec fields the extensions do not touch', ({ expect }) => {
    const code = skill([
      'compatibility: Requires network access.',
      'license: MIT',
      'metadata:',
      '  author: someone',
      '',
    ].join('\n'));

    expect(schemaMessages(claudeCode, code)).toStrictEqual([]);
  });

  it('still rejects an undocumented field', ({ expect }) => {
    const [message, ...rest] = schemaMessages(
      claudeCode,
      skill('user-invocabel: false\n'),
    );

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/additional properties/v);
  });

  it('rejects an effort level outside the documented set', ({ expect }) => {
    const [message, ...rest] = schemaMessages(claudeCode, skill('effort: turbo\n'));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/effort/v);
  });

  it('rejects a non-boolean user-invocable', ({ expect }) => {
    const [message, ...rest] = schemaMessages(
      claudeCode,
      skill('user-invocable: nope\n'),
    );

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/user-invocable/v);
  });

  it('keeps the spec constraints on shared fields', ({ expect }) => {
    const code = '---\nname: My_Skill\ndescription: A skill.\n---\n\n# My skill\n';

    const [message, ...rest] = schemaMessages(claudeCode, code);

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/name/v);
  });
});

describe('configs.recommended without the Claude Code overlay', () => {
  it('flags a Claude Code field', ({ expect }) => {
    const [message, ...rest] = schemaMessages(spec, skill('user-invocable: false\n'));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/additional properties/v);
  });

  it('flags the list form of allowed-tools the spec types as a string', ({ expect }) => {
    const code = skill('allowed-tools:\n  - Read\n');

    const [message, ...rest] = schemaMessages(spec, code);

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/allowed-tools/v);
  });
});
