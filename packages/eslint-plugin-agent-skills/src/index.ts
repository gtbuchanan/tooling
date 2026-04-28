import markdown from '@eslint/markdown';
import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import type { ESLint, Linter } from 'eslint';
import { fileReferences } from './rules/file-references.ts';
import { maxLines } from './rules/max-lines.ts';
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
 * ESLint plugin for Agent Skills-specific lint checks. Most validation
 * lives in the JSON Schema (see `skillFrontmatterSchema`); the rules
 * here cover spec constraints schemas can't express.
 */
const plugin: ESLint.Plugin = {
  rules: {
    'file-references': fileReferences,
    'max-lines': maxLines,
    'name-matches-dir': nameMatchesDir,
  },
};

/**
 * Ready-to-spread flat-config blocks for SKILL.md files.
 *
 * - `recommended` — wires the schema rule and every plugin rule for
 *   `**\/skills/*\/SKILL.md`. Sets `language: 'markdown/commonmark'`
 *   so `file-references` can walk the markdown AST.
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
        'agent-skills/name-matches-dir': 'warn',
        'md-frontmatter/schema': ['warn', { schema }],
      },
    },
  ],
};

export default plugin;
