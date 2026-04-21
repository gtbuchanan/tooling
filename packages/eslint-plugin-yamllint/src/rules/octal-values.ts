import type { Rule } from 'eslint';
import { Scalar, isScalar, visit } from 'yaml';
import { parseYaml, toEslintLoc } from '#src/parse.js';

const implicitOctalPattern = /^0[0-7]+$/v;
const explicitOctalPattern = /^0o[0-7]+$/iv;

interface OctalValuesOptions {
  readonly 'forbid-explicit-octal'?: boolean;
  readonly 'forbid-implicit-octal'?: boolean;
}

const schema = [
  {
    additionalProperties: false,
    properties: {
      'forbid-explicit-octal': { type: 'boolean' },
      'forbid-implicit-octal': { type: 'boolean' },
    },
    type: 'object',
  },
];

/** Flags implicit (0777) and explicit (0o777) YAML 1.1 octal literals. */
export const octalValues: Rule.RuleModule = {
  meta: {
    schema,
    type: 'problem',
  },

  create(context) {
    return {
      Program() {
        const options = (context.options[0] ?? {}) as OctalValuesOptions;
        const forbidImplicit = options['forbid-implicit-octal'] ?? true;
        const forbidExplicit = options['forbid-explicit-octal'] ?? true;
        const text = context.sourceCode.getText();
        const { documents, lineCounter } =
          parseYaml(context.sourceCode, text);

        for (const doc of documents) {
          visit(doc, (_key, node) => {
            if (!isScalar(node)) return;
            if (node.type !== Scalar.PLAIN) return;
            if (!node.source) return;

            const range = node.range;
            if (!range) return;

            const isImplicit =
              forbidImplicit && implicitOctalPattern.test(node.source);
            const isExplicit =
              forbidExplicit && explicitOctalPattern.test(node.source);

            if (!isImplicit && !isExplicit) return;

            const kind = isImplicit ? 'implicit' : 'explicit';

            context.report({
              loc: {
                end: toEslintLoc(lineCounter, range[1]),
                start: toEslintLoc(lineCounter, range[0]),
              },
              message:
                `${kind} octal value "${node.source}"` +
                ' may be interpreted differently across YAML versions',
            });
          });
        }
      },
    };
  },
};
