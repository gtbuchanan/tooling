import {
  parseMarkdown,
  toEslintLoc,
} from '@gtbuchanan/eslint-plugin-md-frontmatter/parse';
import type { Rule } from 'eslint';

interface MaxTokensOptions {
  readonly max?: number;
}

/**
 * UTF-8 bytes per estimated token. Measured against a real BPE
 * tokenizer over a corpus of published `SKILL.md` bodies, the
 * conventional four-per-token rule of thumb held to roughly
 * 1.0x-1.15x of the true count.
 *
 * Bytes rather than characters because that is what a byte-pair
 * tokenizer merges over. The distinction is invisible for ASCII, where
 * the two are equal, and decisive outside it: a CJK character is one
 * UTF-16 unit but three UTF-8 bytes, so counting characters under-reads
 * a Chinese or Japanese body by roughly 3x — passing a skill that is
 * far over any real budget.
 *
 * It still under-reads content a tokenizer fragments past one token per
 * few bytes — long base64 blobs, dense runs of table punctuation, and
 * emoji. Those measured at 2x this estimate, but only in the degenerate
 * case of a body made mostly of them; the table-heavy skills in the
 * corpus land inside the band above.
 */
const bytesPerToken = 4;

// Code points at which UTF-8 widens its encoding by one byte.
const twoByteFloor = 0x80;
const threeByteFloor = 0x8_00;
const fourByteFloor = 0x1_00_00;
const utf8WidthBoundaries = [twoByteFloor, threeByteFloor, fourByteFloor];

/**
 * UTF-8 width of a code point: one byte, plus one for each boundary it
 * has reached. Derived arithmetically rather than by encoding, so
 * measuring a body costs a single pass.
 */
const utf8Width = (codePoint: number): number =>
  1 + utf8WidthBoundaries.filter(boundary => codePoint >= boundary).length;

interface BodyMeasurement {
  readonly byteLength: number;
  /**
   * Character offset of the first code point past `byteBudget`, or
   * `-1` when the body fits. Lets the report span the overflow rather
   * than the whole file.
   */
  readonly overflowOffset: number;
}

const measureBody = (
  text: string,
  start: number,
  byteBudget: number,
): BodyMeasurement => {
  let byteLength = 0;
  let overflowOffset = -1;
  let index = start;

  /* Iterating the string yields whole code points, so an astral
     character is measured once rather than as two surrogate halves,
     and `length` gives the UTF-16 width to advance the offset by. */
  for (const character of text.slice(start)) {
    byteLength += utf8Width(character.codePointAt(0) ?? 0);
    if (overflowOffset === -1 && byteLength > byteBudget) overflowOffset = index;
    index += character.length;
  }

  return { byteLength, overflowOffset };
};

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
 * The count is an estimate — see `bytesPerToken` for how it is derived
 * and where it stops holding. Every agent host tokenizes differently
 * and no bundled tokenizer would be authoritative for all of them, so
 * this rule approximates rather than adding a dependency that implies
 * a precision it can't deliver. Defaults to 5000 tokens.
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
      const byteBudget = max * bytesPerToken;
      const { byteLength, overflowOffset } =
        measureBody(text, bodyStart, byteBudget);
      // Equivalent to comparing the rounded-up estimate against `max`.
      if (byteLength <= byteBudget) return;

      const { lines } = context.sourceCode;
      context.report({
        data: {
          actual: String(Math.ceil(byteLength / bytesPerToken)),
          max: String(max),
        },
        loc: {
          end: { column: lines.at(-1)?.length ?? 0, line: lines.length },
          start: toEslintLoc(lineCounter, overflowOffset),
        },
        messageId: 'tooManyTokens',
      });
    },
  }),
};
