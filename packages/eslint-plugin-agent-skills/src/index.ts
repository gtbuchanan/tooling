import json from '@eslint/json';
import markdown from '@eslint/markdown';
import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import type { ESLint, Linter } from 'eslint';
import { evalsSchema } from './rules/evals-schema.ts';
import { fileReferences } from './rules/file-references.ts';
import { maxLines } from './rules/max-lines.ts';
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
        'agent-skills/max-lines': ['warn', { max: 500 }],
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
        'agent-skills/max-lines': ['warn', { max: 300 }],
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
