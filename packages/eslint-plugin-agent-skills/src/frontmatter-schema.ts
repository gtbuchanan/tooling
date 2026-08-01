import markdown from '@eslint/markdown';
import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import type { SchemaObject } from 'ajv';
import type { Linter } from 'eslint';
import { skillFrontmatterHosts } from './hosts/index.ts';
import type { SkillFrontmatterHost } from './hosts/index.ts';
import specSchema from './schema.json' with { type: 'json' };

/**
 * Frontmatter fields a host understands on top of the
 * [Agent Skills specification](https://agentskills.io/specification),
 * as a JSON Schema property map. The spec sanctions only the nested
 * `metadata` map for client-specific data, so a host that puts fields
 * at the top level — as Claude Code does — is describing its own
 * surface, and each field has to be declared rather than pattern-matched.
 */
export type SkillFrontmatterExtensions = Readonly<Record<string, SchemaObject>>;

/**
 * A set of frontmatter extensions to layer on: the name of a host this
 * package ships (see `skillFrontmatterHosts`), or a property map of
 * your own for a host it doesn't.
 */
export type SkillFrontmatterSource =
  | SkillFrontmatterHost
  | SkillFrontmatterExtensions;

/*
 * A name absent from the registry contributes nothing, which would
 * surface as unexplained frontmatter errors on every skill rather than
 * as the misconfiguration it is, so it fails loudly instead.
 */
const toExtensions = (
  source: SkillFrontmatterSource,
): SkillFrontmatterExtensions => {
  if (typeof source !== 'string') return source;
  if (!Object.hasOwn(skillFrontmatterHosts, source)) {
    throw new Error(
      `Unknown Agent Skills host \`${source}\`. Known hosts: ${
        Object.keys(skillFrontmatterHosts).join(', ')
      }.`,
    );
  }
  return skillFrontmatterHosts[source];
};

/**
 * Layers host extensions onto the spec frontmatter schema, accepting as
 * many sources as a repo targets:
 *
 * ```typescript
 * defineSkillFrontmatterSchema('claude-code');
 * defineSkillFrontmatterSchema('claude-code', { 'x-team-owner': { type: 'string' } });
 * ```
 *
 * Sources are unioned — the result accepts every field any of them
 * declares, which is what a repo whose skills run under several hosts
 * needs. It cannot express "valid under *every* host at once"; that is
 * the spec schema, which is what you get by passing nothing.
 *
 * A field two sources both declare takes its definition from the later
 * one, so a caller can override a shipped host's field by passing their
 * own map after it. No two shipped hosts currently declare the same
 * field.
 *
 * Property definitions are all that is layered on: `name` and
 * `description` stay required and every spec constraint still applies,
 * so a skill validated against the result stays portable apart from the
 * extension fields themselves.
 *
 * The result carries no `$id` — it describes a composition local to the
 * caller, not the canonical schema published under the spec's id.
 */
export const defineSkillFrontmatterSchema = (
  ...sources: readonly SkillFrontmatterSource[]
): SchemaObject => {
  const { $id: _local, ...spec } = specSchema;

  return {
    ...spec,
    properties: Object.assign(
      {},
      spec.properties,
      ...sources.map(toExtensions),
    ) as SchemaObject,
    title: 'Agent Skills SKILL.md frontmatter with host extensions',
  };
};

/**
 * Flat-config overlay pointing `md-frontmatter/schema` at the spec
 * schema extended with `sources`:
 *
 * ```typescript
 * export default [
 *   ...configs.recommended,
 *   ...defineSkillFrontmatterConfig('claude-code'),
 * ];
 * ```
 *
 * Spread it *after* `configs.recommended` — it re-points one rule and
 * relies on flat config's last-match-wins merge, so the spec schema
 * wins if the order is reversed. For that same reason, compose several
 * hosts in one call rather than spreading one overlay per host: a
 * second overlay replaces the first instead of merging with it.
 */
export const defineSkillFrontmatterConfig = (
  ...sources: readonly SkillFrontmatterSource[]
): readonly Linter.Config[] => [
  {
    files: ['**/skills/*/SKILL.md'],
    language: 'markdown/commonmark',
    plugins: { markdown, 'md-frontmatter': frontmatter },
    rules: {
      'md-frontmatter/schema': [
        'warn',
        { schema: defineSkillFrontmatterSchema(...sources) },
      ],
    },
  },
];
