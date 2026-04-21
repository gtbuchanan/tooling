import type { Rule } from 'eslint';
import type { Document, LineCounter, Range } from 'yaml';
import { isAlias, isCollection, isScalar, visit } from 'yaml';
import { parseYaml, toEslintLoc } from '#src/parse.js';

interface AnchorsOptions {
  readonly 'forbid-duplicated-anchors'?: boolean;
  readonly 'forbid-undeclared-aliases'?: boolean;
  readonly 'forbid-unused-anchors'?: boolean;
}

const schema = [
  {
    additionalProperties: false,
    properties: {
      'forbid-duplicated-anchors': { type: 'boolean' },
      'forbid-undeclared-aliases': { type: 'boolean' },
      'forbid-unused-anchors': { type: 'boolean' },
    },
    type: 'object',
  },
];

interface CollectedAnchors {
  readonly aliases: ReadonlyMap<string, readonly Range[]>;
  readonly anchors: ReadonlyMap<string, readonly Range[]>;
}

const collectAnchors = (doc: Document.Parsed): CollectedAnchors => {
  const anchorMap = new Map<string, Range[]>();
  const aliasMap = new Map<string, Range[]>();

  visit(doc, (_key, node) => {
    if (isAlias(node)) {
      if (node.range) {
        const list = aliasMap.get(node.source) ?? [];
        list.push(node.range);
        aliasMap.set(node.source, list);
      }
      return;
    }

    if (isScalar(node) || isCollection(node)) {
      const { anchor, range } = node;
      if (anchor && range) {
        const list = anchorMap.get(anchor) ?? [];
        list.push(range);
        anchorMap.set(anchor, list);
      }
    }
  });

  return { aliases: aliasMap, anchors: anchorMap };
};

const reportAnchorIssues = (
  context: Rule.RuleContext,
  collected: CollectedAnchors,
  lineCounter: LineCounter,
  options: { forbidDuplicated: boolean; forbidUnused: boolean },
): void => {
  for (const [name, ranges] of collected.anchors) {
    if (options.forbidDuplicated && ranges.length > 1) {
      for (const range of ranges.slice(1)) {
        context.report({
          loc: toEslintLoc(lineCounter, range[0]),
          message: `duplicate anchor "&${name}"`,
        });
      }
    }

    if (options.forbidUnused && !collected.aliases.has(name)) {
      const first = ranges[0];
      if (!first) continue;
      context.report({
        loc: toEslintLoc(lineCounter, first[0]),
        message: `unused anchor "&${name}"`,
      });
    }
  }
};

const reportUndeclaredAliases = (
  context: Rule.RuleContext,
  collected: CollectedAnchors,
  lineCounter: LineCounter,
): void => {
  for (const [name, ranges] of collected.aliases) {
    if (collected.anchors.has(name)) continue;

    for (const range of ranges) {
      context.report({
        loc: toEslintLoc(lineCounter, range[0]),
        message: `undeclared alias "*${name}"`,
      });
    }
  }
};

/** Detects unused anchors, duplicate anchors, and undeclared aliases. */
export const anchors: Rule.RuleModule = {
  meta: {
    schema,
    type: 'problem',
  },

  create(context) {
    return {
      Program() {
        const options = (context.options[0] ?? {}) as AnchorsOptions;
        const forbidDuplicated =
          options['forbid-duplicated-anchors'] ?? true;
        const forbidUndeclared =
          options['forbid-undeclared-aliases'] ?? true;
        const forbidUnused =
          options['forbid-unused-anchors'] ?? true;
        const text = context.sourceCode.getText();
        const { documents, lineCounter } =
          parseYaml(context.sourceCode, text);

        for (const doc of documents) {
          const collected = collectAnchors(doc);
          reportAnchorIssues(
            context, collected, lineCounter,
            { forbidDuplicated, forbidUnused },
          );
          if (forbidUndeclared) {
            reportUndeclaredAliases(
              context, collected, lineCounter,
            );
          }
        }
      },
    };
  },
};
