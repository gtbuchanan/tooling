import {
  parseMarkdown,
  toEslintLoc,
} from '@gtbuchanan/eslint-plugin-md-frontmatter/parse';
import type { Rule } from 'eslint';

interface MaxTokensOptions {
  readonly max?: number;
}

/**
 * Characters per estimated token. Measured against a real BPE
 * tokenizer over a corpus of published `SKILL.md` bodies, the
 * conventional four-characters-per-token rule of thumb held to
 * roughly 1.0x-1.15x of the true count — never under-counting, so a
 * body this rule passes is one a real tokenizer also passes.
 */
const charsPerToken = 4;

/**
 * Caps the `SKILL.md` body at a maximum estimated token count, per the
 * Agent Skills spec's
 * [Progressive disclosure](https://agentskills.io/specification#progressive-disclosure)
 * guidance that the instructions tier stay under 5000 tokens. Frontmatter
 * is excluded: the spec accounts for `name` and `description` separately
 * as the ~100-token metadata tier loaded at startup, so a long
 * description shouldn't eat the instruction budget.
 *
 * Complements `max-lines` rather than duplicating it — a table- or
 * code-heavy skill can sit well under 500 lines and still blow the
 * token budget, and a skill of many short lines can do the reverse.
 *
 * The count is an estimate. Every agent host tokenizes differently and
 * no bundled tokenizer would be authoritative for all of them, so this
 * rule approximates rather than adding a dependency that implies a
 * precision it can't deliver. Defaults to 5000 tokens.
 */
export const maxTokens: Rule.RuleModule = {
  meta: {
    messages: {
      tooManyTokens:
        'File body is ~{{actual}} tokens (estimated). ' +
        'Maximum recommended is {{max}}.',
    },
    schema: [{
      additionalProperties: false,
      properties: { max: { minimum: 0, type: 'integer' } },
      type: 'object',
    }],
    type: 'suggestion',
  },

  create: context => ({
    // Key off the actual AST root so this fires under any markdown
    // parser or language (e.g. `@eslint/markdown`'s `root` mdast node).
    [context.sourceCode.ast.type]() {
      const { max = 5000 } = (context.options[0] ?? {}) as MaxTokensOptions;
      const text = context.sourceCode.getText();
      const { frontmatter, lineCounter } = parseMarkdown(
        context.sourceCode,
        text,
      );

      const bodyStart = frontmatter?.endOffset ?? 0;
      const budget = max * charsPerToken;
      /* Equivalent to comparing the rounded-up estimate against `max`,
         but staying in characters also gives the offset where the
         budget runs out, so the report can point at the overflow. */
      if (text.length - bodyStart <= budget) return;

      const { lines } = context.sourceCode;
      context.report({
        data: {
          actual: String(Math.ceil((text.length - bodyStart) / charsPerToken)),
          max: String(max),
        },
        loc: {
          end: { column: lines.at(-1)?.length ?? 0, line: lines.length },
          start: toEslintLoc(lineCounter, bodyStart + budget),
        },
        messageId: 'tooManyTokens',
      });
    },
  }),
};
