import fs from 'node:fs';
import path from 'node:path';
import type { JSRuleDefinition } from 'eslint';

interface MinEvalsOptions {
  readonly min?: number;
}

type MinEvalsRule = JSRuleDefinition<{
  MessageIds: 'tooFew';
  RuleOptions: [MinEvalsOptions?];
}>;

const defaultMin = 1;

const countEvals = (evalsPath: string): number => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return 0;
    if (!('evals' in parsed)) return 0;
    const { evals } = parsed;
    return Array.isArray(evals) ? evals.length : 0;
  } catch {
    /* Missing file or malformed JSON. The `evals-schema` rule
       provides the precise diagnostic for malformed cases. */
    return 0;
  }
};

/**
 * Requires every Agent Skill to ship at least N eval cases in its
 * sibling `evals/evals.json` file. Missing file, malformed JSON, and
 * empty `evals` array all count as zero — the `evals-schema` rule
 * provides precise diagnostics for the malformed cases. Defaults to
 * `min: 1`; raise via the `min` option for a stricter coverage bar.
 */
export const minEvals: MinEvalsRule = {
  meta: {
    messages: {
      tooFew:
        'Skill has too few eval cases ({{actual}}) in ' +
        '`evals/evals.json`. Minimum is {{min}}.',
    },
    schema: [{
      additionalProperties: false,
      properties: { min: { minimum: 0, type: 'integer' } },
      type: 'object',
    }],
    type: 'problem',
  },

  create(context) {
    return {
      // Key off the actual AST root so this fires under any markdown
      // parser or language (e.g. @eslint/markdown's `root` mdast node).
      [context.sourceCode.ast.type]() {
        const { filename } = context;
        if (!filename) return;
        const { min = defaultMin } = context.options[0] ?? {};

        const evalsPath = path.join(
          path.dirname(filename),
          'evals',
          'evals.json',
        );
        const actual = countEvals(evalsPath);
        if (actual >= min) return;

        context.report({
          data: { actual: String(actual), min: String(min) },
          loc: {
            end: { column: 0, line: 1 },
            start: { column: 0, line: 1 },
          },
          messageId: 'tooFew',
        });
      },
    };
  },
};
