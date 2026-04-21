import type { Rule } from 'eslint';
import { Scalar, isScalar, visit } from 'yaml';
import { parseYaml, toEslintLoc } from '#src/parse.js';

/**
 * YAML 1.1 boolean-like values that may be silently coerced.
 * Matches: y, Y, yes, Yes, YES, n, N, no, No, NO, true, True, TRUE,
 * false, False, FALSE, on, On, ON, off, Off, OFF.
 */
const yaml11Booleans = new Set([
  'false', 'False', 'FALSE',
  'n', 'N', 'no', 'No', 'NO',
  'off', 'Off', 'OFF',
  'on', 'On', 'ON',
  'true', 'True', 'TRUE',
  'y', 'Y', 'yes', 'Yes', 'YES',
]);

interface TruthyOptions {
  readonly 'allowed-values'?: readonly string[];
  readonly 'check-keys'?: boolean;
}

const schema = [
  {
    additionalProperties: false,
    properties: {
      'allowed-values': {
        items: { type: 'string' },
        type: 'array',
      },
      'check-keys': { type: 'boolean' },
    },
    type: 'object',
  },
];

/** Flags unquoted YAML 1.1 boolean-like values that may be silently coerced. */
export const truthy: Rule.RuleModule = {
  meta: {
    fixable: 'code',
    schema,
    type: 'problem',
  },

  create(context) {
    return {
      Program() {
        const options = (context.options[0] ?? {}) as TruthyOptions;
        const checkKeys = options['check-keys'] ?? false;
        const allowedValues = new Set(options['allowed-values']);
        const text = context.sourceCode.getText();
        const { documents, lineCounter } =
          parseYaml(context.sourceCode, text);

        for (const doc of documents) {
          visit(doc, (_key, node) => {
            if (!isScalar(node)) return;
            if (node.type !== Scalar.PLAIN) return;
            const { source } = node;
            if (source === undefined) return;
            if (!yaml11Booleans.has(source)) return;
            if (allowedValues.has(source)) return;

            if (_key === 'key' && !checkKeys) return;

            const range = node.range;
            if (!range) return;

            context.report({
              fix: fixer =>
                fixer.replaceTextRange(
                  [range[0], range[1]],
                  `"${source}"`,
                ),
              loc: {
                end: toEslintLoc(lineCounter, range[1]),
                start: toEslintLoc(lineCounter, range[0]),
              },
              message:
                `truthy value "${source}" should be quoted` +
                ' to avoid YAML 1.1 boolean coercion',
            });
          });
        }
      },
    };
  },
};
