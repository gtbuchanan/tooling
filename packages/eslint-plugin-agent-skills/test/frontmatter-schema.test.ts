import path from 'node:path';
import markdown from '@eslint/markdown';
import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import { Linter } from 'eslint';
import { describe, it } from 'vitest';
import {
  configs,
  defineSkillFrontmatterConfig,
  defineSkillFrontmatterSchema,
} from '#src/index.js';

const cwd = path.resolve('/repo');
const skillFile = path.join(cwd, 'skills', 'my-skill', 'SKILL.md');

const linter = new Linter({ cwd });

/** Extensions for a host this package ships nothing for. */
const teamExtensions = { 'x-team-owner': { minLength: 1, type: 'string' } };

/** Wraps extra frontmatter lines in an otherwise spec-valid `SKILL.md`. */
const skill = (extra = ''): string =>
  `---\nname: my-skill\ndescription: A skill.\n${extra}---\n\n# My skill\n`;

const schemaMessages = (
  overlay: readonly Linter.Config[],
  code: string,
): readonly Linter.LintMessage[] => linter
  .verify(code, [...configs.recommended, ...overlay], skillFile)
  .filter(message => message.ruleId === 'md-frontmatter/schema');

describe('defineSkillFrontmatterConfig', () => {
  it('accepts a field declared by a caller-supplied extension', ({ expect }) => {
    const overlay = defineSkillFrontmatterConfig(teamExtensions);

    const messages = schemaMessages(overlay, skill('x-team-owner: platform\n'));

    expect(messages).toStrictEqual([]);
  });

  it('accepts a field declared by a host named in the registry', ({ expect }) => {
    const overlay = defineSkillFrontmatterConfig('claude-code');

    const messages = schemaMessages(overlay, skill('user-invocable: false\n'));

    expect(messages).toStrictEqual([]);
  });

  it('rejects a field no source declares', ({ expect }) => {
    const overlay = defineSkillFrontmatterConfig(teamExtensions);

    const [message, ...rest] = schemaMessages(overlay, skill('x-team-lead: platform\n'));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/additional properties/v);
  });

  it('enforces the declared type of an extension field', ({ expect }) => {
    const overlay = defineSkillFrontmatterConfig(teamExtensions);

    const [message, ...rest] = schemaMessages(overlay, skill('x-team-owner: 5\n'));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/x-team-owner/v);
  });

  it('leaves the spec schema in force with no sources', ({ expect }) => {
    const overlay = defineSkillFrontmatterConfig();

    const [message, ...rest] = schemaMessages(overlay, skill('user-invocable: false\n'));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/additional properties/v);
  });
});

describe('defineSkillFrontmatterConfig with several sources', () => {
  const overlay = defineSkillFrontmatterConfig('claude-code', teamExtensions);

  it('accepts fields from every source at once', ({ expect }) => {
    const code = skill('user-invocable: false\nx-team-owner: platform\n');

    expect(schemaMessages(overlay, code)).toStrictEqual([]);
  });

  it('accepts a field from one source without the others present', ({ expect }) => {
    expect(schemaMessages(overlay, skill('x-team-owner: platform\n')))
      .toStrictEqual([]);
  });

  it('still rejects a field none of the sources declares', ({ expect }) => {
    const [message, ...rest] = schemaMessages(overlay, skill('x-team-lead: platform\n'));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/additional properties/v);
  });

  it('takes a contested field from the last source that declares it', ({ expect }) => {
    /*
     * `claude-code` types `user-invocable` as a boolean; the override
     * re-types it as a string, so the boolean is what must now fail.
     */
    const overridden = defineSkillFrontmatterConfig(
      'claude-code',
      { 'user-invocable': { minLength: 1, type: 'string' } },
    );

    expect(schemaMessages(overridden, skill('user-invocable: never\n')))
      .toStrictEqual([]);
    expect(schemaMessages(overridden, skill('user-invocable: false\n')))
      .not.toStrictEqual([]);
  });
});

describe('defineSkillFrontmatterSchema', () => {
  /* Hand-wired rather than via the overlay, so the schema is the only
     thing under test — the config below is the caller's own. */
  const config: Linter.Config[] = [
    {
      files: ['**/skills/*/SKILL.md'],
      language: 'markdown/commonmark',
      plugins: { markdown, 'md-frontmatter': frontmatter },
      rules: {
        'md-frontmatter/schema': [
          'warn',
          { schema: defineSkillFrontmatterSchema('claude-code', teamExtensions) },
        ],
      },
    },
  ];

  const messagesFor = (code: string): readonly Linter.LintMessage[] => linter
    .verify(code, config, skillFile)
    .filter(message => message.ruleId === 'md-frontmatter/schema');

  it('produces a schema usable as rule options directly', ({ expect }) => {
    const code = skill('user-invocable: false\nx-team-owner: platform\n');

    expect(messagesFor(code)).toStrictEqual([]);
  });

  /*
   * Pairs with the case above: on its own, an empty-message assertion
   * passes just as well when the rule never fires at all, so the same
   * hand-wired config has to be shown reporting something.
   */
  it('reports through that wiring when frontmatter is invalid', ({ expect }) => {
    const [message, ...rest] = messagesFor(skill('x-team-lead: platform\n'));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/additional properties/v);
  });

  /*
   * TypeScript rejects an unshipped name outright; this covers the JS
   * consumer, for whom the alternative is a registry miss that
   * contributes no fields and surfaces as unexplained frontmatter
   * errors on every skill.
   */
  it('throws on a host name it does not ship', ({ expect }) => {
    expect(() =>
      // @ts-expect-error -- unshipped host name, rejected at runtime
      defineSkillFrontmatterSchema('claude-cod'),
    ).toThrow(/claude-cod/v);
  });

  it('keeps the spec requirements no source mentions', ({ expect }) => {
    const overlay = defineSkillFrontmatterConfig(teamExtensions);
    const code = '---\nname: my-skill\nx-team-owner: platform\n---\n\n# My skill\n';

    const [message, ...rest] = schemaMessages(overlay, code);

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/description/v);
  });
});
