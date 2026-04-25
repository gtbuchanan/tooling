import path from 'node:path';
import {
  parseMarkdown,
  toEslintLoc,
} from '@gtbuchanan/eslint-plugin-md-frontmatter/parse';
import type { Rule } from 'eslint';
import { isMap, isScalar } from 'yaml';

/**
 * Validates that the Agent Skills SKILL.md `name` frontmatter field
 * matches the parent directory name, per the spec. Other field-level
 * checks (length, kebab-case, required) are expressed in the
 * frontmatter JSON Schema and run via `md-frontmatter/schema` — this
 * rule covers the one constraint a pure schema can't express.
 */
export const nameMatchesDir: Rule.RuleModule = {
  meta: {
    schema: [],
    type: 'problem',
  },

  create(context) {
    return {
      Program() {
        const { filename } = context;
        if (!filename) return;
        const text = context.sourceCode.getText();
        const { frontmatter, lineCounter } = parseMarkdown(
          context.sourceCode,
          text,
        );
        if (!frontmatter) return;

        const root = frontmatter.document.contents;
        if (!isMap(root)) return;
        const pair = root.items.find(
          item => isScalar(item.key) && item.key.value === 'name',
        );
        if (!pair || !isScalar(pair.value)) return;
        const { range, value } = pair.value;
        if (typeof value !== 'string') return;

        const parentDir = path.basename(path.dirname(filename));
        if (value === parentDir) return;

        const [start, end] = range;
        context.report({
          loc: {
            end: toEslintLoc(lineCounter, frontmatter.contentOffset + end),
            start: toEslintLoc(lineCounter, frontmatter.contentOffset + start),
          },
          message:
            '`name` must match the parent directory name ' +
            `(expected \`${parentDir}\`, got \`${value}\`)`,
        });
      },
    };
  },
};
