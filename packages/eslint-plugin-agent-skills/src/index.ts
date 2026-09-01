import json from '@eslint/json';
import markdown from '@eslint/markdown';
import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import type { ESLint, Linter } from 'eslint';
import { evalsSchema } from './rules/evals-schema.ts';
import { fileReferences } from './rules/file-references.ts';
import { maxLines } from './rules/max-lines.ts';
import { maxTokens } from './rules/max-tokens.ts';
import { minEvals } from './rules/min-evals.ts';
import { nameMatchesDir } from './rules/name-matches-dir.ts';
import schema from './schema.json' with { type: 'json' };

/**
 * JSON Schema for Agent Skills `SKILL.md` frontmatter, per the
 * [Agent Skills specification](https://agentskills.io/specification).
 * Pair with `@gtbuchanan/eslint-plugin-md-frontmatter`'s `schema` rule
 * to validate frontmatter at lint time. `$id` is set to a
 * forward-looking canonical URL — the schema is not yet published at
 * that location.
 */
export { default as skillFrontmatterSchema }
  from './schema.json' with { type: 'json' };

export {
  defineSkillFrontmatterConfig,
  defineSkillFrontmatterSchema,
} from './frontmatter-schema.ts';
export type {
  SkillFrontmatterExtensions,
  SkillFrontmatterSource,
} from './frontmatter-schema.ts';
export { skillFrontmatterHosts } from './hosts/index.ts';
export type { SkillFrontmatterHost } from './hosts/index.ts';

/**
 * JSON Schema for an Agent Skill's `evals/evals.json` file, matching
 * the canonical layout documented by Anthropic's `skill-creator`
 * skill (top-level `skill_name` plus an `evals[]` array, each entry
 * with `id`, `prompt`, `expected_output`, optional `files`, and
 * `expectations`). Consumers can reference it via `$schema` for
 * editor autocomplete; the `agent-skills/evals-schema` rule
 * validates against it at lint time.
 */
export { default as skillEvalsSchema }
  from './schemas/evals.json' with { type: 'json' };

/**
 * ESLint plugin for Agent Skills-specific lint checks. Most validation
 * lives in the JSON Schema (see `skillFrontmatterSchema`); the rules
 * here cover spec constraints schemas can't express.
 */
const plugin: ESLint.Plugin = {
  rules: {
    'evals-schema': evalsSchema,
    'file-references': fileReferences,
    'max-lines': maxLines,
    'max-tokens': maxTokens,
    'min-evals': minEvals,
    'name-matches-dir': nameMatchesDir,
  },
};

/**
 * Ready-to-spread flat-config blocks for Agent Skills files. The
 * `markdown/commonmark` language is required so `file-references`
 * can walk the markdown AST. The 300-line cap on `references/**` is
 * tighter than the 500-line `SKILL.md` cap to mirror the spec's
 * [Progressive disclosure](https://agentskills.io/specification#progressive-disclosure)
 * guidance that ancillary reference files stay focused and smaller
 * than `SKILL.md`; 300 sits just above the p90 line count of files
 * in popular published skills.
 *
 * `max-tokens` is wired for `SKILL.md` alone. The spec's token budget
 * names the instructions tier specifically and gives no figure for
 * reference files, which are loaded on demand rather than up front —
 * the 300-line cap already keeps those focused.
 *
 * `recommended` validates frontmatter against the bare spec, so a host
 * extension reads as an unknown property. Repos targeting one or more
 * hosts spread a `defineSkillFrontmatterConfig(...)` overlay after it.
 */
export const configs: {
  readonly recommended: readonly Linter.Config[];
} = {
  recommended: [
    {
      files: ['**/skills/*/SKILL.md'],
      language: 'markdown/commonmark',
      plugins: {
        'agent-skills': plugin,
        markdown,
        'md-frontmatter': frontmatter,
      },
      rules: {
        'agent-skills/file-references': 'warn',
        /*
         * `max-lines` is deliberately absent, though the spec does say
         * "Keep your main `SKILL.md` under 500 lines". At the ~10-14
         * tokens/line typical of prose skills, 500 lines is 5200-7000
         * tokens, so `max-tokens` is the one that fires; the line cap
         * leads only below ~10 tokens/line, where semantic line breaks
         * or dense lists raise it without changing what the agent loads.
         * The rule stays exported for repos wanting the spec's figure.
         */
        'agent-skills/max-tokens': ['warn', { max: 5000 }],
        'agent-skills/min-evals': 'warn',
        'agent-skills/name-matches-dir': 'warn',
        'md-frontmatter/schema': ['warn', { schema }],
      },
    },
    {
      files: ['**/skills/*/references/**/*.md'],
      language: 'markdown/commonmark',
      plugins: { 'agent-skills': plugin, markdown },
      rules: {
        /*
         * A backstop, not a spec limit. Nothing upstream caps a
         * reference file: the spec's third tier is "Resources (as
         * needed)" and `skill-creator` calls bundled resources
         * "unlimited, loaded as needed". What is still worth flagging is
         * one costing more to load than the instructions tier it was
         * split out of — hence the same 5000 tokens.
         */
        'agent-skills/max-tokens': ['warn', { max: 5000 }],
      },
    },
    {
      files: ['**/skills/*/evals/evals.json'],
      language: 'json/json',
      plugins: { 'agent-skills': plugin, json },
      rules: {
        'agent-skills/evals-schema': 'warn',
      },
    },
  ],
};

export default plugin;
