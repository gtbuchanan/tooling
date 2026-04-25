import type { ESLint } from 'eslint';
import { schema } from './rules/schema.ts';

/**
 * ESLint plugin validating Markdown YAML frontmatter against a
 * user-supplied JSON Schema. Generic — knows nothing about specific
 * schemas (Agent Skills, changesets, etc.); consumers supply the
 * schema via the rule option.
 */
const plugin: ESLint.Plugin = {
  rules: {
    schema,
  },
};

export default plugin;
