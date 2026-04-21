import type { Rule } from 'eslint';
import type { Document, LineCounter } from 'yaml';
import { parseYaml, toEslintLoc } from '#src/parse.js';

interface DocumentEndOptions {
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
  const contentEnd = doc.range[1];

  context.report({
    fix: fixer => fixer.insertTextAfterRange(
      [contentEnd, contentEnd],
      '...\n',
    ),
    loc: toEslintLoc(lineCounter, contentEnd),
    message: 'missing document end marker "..."',
  });
};

const reportUnwanted = (
  context: Rule.RuleContext,
  doc: Document.Parsed,
  text: string,
  lineCounter: LineCounter,
): void => {
  const markerStart = text.indexOf('...', doc.range[1]);
  if (markerStart === -1) return;

  let markerEnd = markerStart + '...'.length;
  if (text[markerEnd] === '\r') markerEnd += 1;
  if (text[markerEnd] === '\n') markerEnd += 1;

  context.report({
    fix: fixer => fixer.removeRange([markerStart, markerEnd]),
    loc: {
      end: toEslintLoc(lineCounter, markerEnd),
      start: toEslintLoc(lineCounter, markerStart),
    },
    message: 'unexpected document end marker "..."',
  });
};

/** Requires or forbids `...` document end markers. */
export const documentEnd: Rule.RuleModule = {
  meta: {
    fixable: 'code',
    schema,
    type: 'layout',
  },

  create(context) {
    return {
      Program() {
        const options = (context.options[0] ?? {}) as DocumentEndOptions;
        const present = options.present ?? false;
        const text = context.sourceCode.getText();
        const { documents, lineCounter } =
          parseYaml(context.sourceCode, text);

        for (const doc of documents) {
          if (!doc.contents) continue;

          if (present && !doc.directives.docEnd) {
            reportMissing(context, doc, lineCounter);
          } else if (!present && doc.directives.docEnd) {
            reportUnwanted(context, doc, text, lineCounter);
          }
        }
      },
    };
  },
};
