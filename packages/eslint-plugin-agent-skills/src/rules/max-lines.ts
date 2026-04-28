import type { Rule } from 'eslint';

interface MaxLinesOptions {
  readonly max?: number;
}

/**
 * Caps SKILL.md at a maximum line count, per the Agent Skills spec.
 * Mirrors core ESLint's `max-lines` rule but keys off the actual AST
 * root so it fires under any markdown parser or language — the core
 * rule's `Program` visitor never runs against `\@eslint/markdown`'s
 * `root` mdast node. Defaults to 500 lines.
 */
export const maxLines: Rule.RuleModule = {
  meta: {
    messages: {
      tooLong: 'File has too many lines ({{actual}}). Maximum allowed is {{max}}.',
    },
    schema: [{
      additionalProperties: false,
      properties: { max: { minimum: 0, type: 'integer' } },
      type: 'object',
    }],
    type: 'suggestion',
  },

  create(context) {
    return {
      [context.sourceCode.ast.type]() {
        const { max = 500 } = (context.options[0] ?? {}) as MaxLinesOptions;
        const actual = context.sourceCode.lines.length;
        if (actual <= max) return;

        context.report({
          data: { actual: String(actual), max: String(max) },
          loc: { end: { column: 0, line: 1 }, start: { column: 0, line: 1 } },
          messageId: 'tooLong',
        });
      },
    };
  },
};
