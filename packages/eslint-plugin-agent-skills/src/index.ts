import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import type { ESLint, Linter } from 'eslint';
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
 * lives in the JSON Schema (see `skillFrontmatterSchema`); this plugin
 * only ships the `name-matches-dir` rule for the one spec constraint
 * that schemas can't express.
 */
const plugin: ESLint.Plugin = {
  rules: {
    'name-matches-dir': nameMatchesDir,
  },
};

/**
 * Ready-to-spread flat-config blocks for SKILL.md files.
 *
 * - `recommended` — wires `md-frontmatter/schema` (with the canonical
 *   schema), `agent-skills/name-matches-dir`, and core `max-lines: 500`
 *   for file-length enforcement, scoped to `**\/skills/*\/SKILL.md`.
 */
export const configs: {
  readonly recommended: readonly Linter.Config[];
} = {
  recommended: [
    {
      files: ['**/skills/*/SKILL.md'],
      plugins: {
        'agent-skills': plugin,
        'md-frontmatter': frontmatter,
      },
      rules: {
        'agent-skills/name-matches-dir': 'warn',
        'max-lines': ['warn', { max: 500 }],
        'md-frontmatter/schema': ['warn', { schema }],
      },
    },
  ],
};

export default plugin;
