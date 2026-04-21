import type { Rule } from 'eslint';
import type { Document, LineCounter } from 'yaml';
import { parseYaml, toEslintLoc } from '#src/parse.js';

interface DocumentStartOptions {
  readonly present?: boolean;
}

const schema = [
  {
    additionalProperties: false,
    properties: {
      present: { type: 'boolean' },
    },
    type: 'object',
  },
];

const reportMissing = (
  context: Rule.RuleContext,
  doc: Document.Parsed,
  lineCounter: LineCounter,
): void => {
  const [start] = doc.range;

  context.report({
    fix: fixer => fixer.insertTextBeforeRange(
      [start, start],
      '---\n',
    ),
    loc: toEslintLoc(lineCounter, start),
    message: 'missing document start marker "---"',
  });
};

const reportUnwanted = (
  context: Rule.RuleContext,
  doc: Document.Parsed,
  text: string,
  lineCounter: LineCounter,
): void => {
  const [start] = doc.range;
  const markerStart = text.indexOf('---', start);
  if (markerStart === -1) return;

  let markerEnd = markerStart + '---'.length;
  if (text[markerEnd] === '\r') markerEnd += 1;
  if (text[markerEnd] === '\n') markerEnd += 1;

  context.report({
    fix: fixer => fixer.removeRange([markerStart, markerEnd]),
    loc: {
      end: toEslintLoc(lineCounter, markerEnd),
      start: toEslintLoc(lineCounter, markerStart),
    },
    message: 'unexpected document start marker "---"',
  });
};

/** Requires or forbids `---` document start markers. */
export const documentStart: Rule.RuleModule = {
  meta: {
    fixable: 'code',
    schema,
    type: 'layout',
  },

  create(context) {
    return {
      Program() {
        const options = (context.options[0] ?? {}) as DocumentStartOptions;
        const present = options.present ?? true;
        const text = context.sourceCode.getText();
        const { documents, lineCounter } =
          parseYaml(context.sourceCode, text);

        for (const doc of documents) {
          if (!doc.contents) continue;

          if (present && !doc.directives.docStart) {
            reportMissing(context, doc, lineCounter);
          } else if (!present && doc.directives.docStart) {
            reportUnwanted(context, doc, text, lineCounter);
          }
        }
      },
    };
  },
};
