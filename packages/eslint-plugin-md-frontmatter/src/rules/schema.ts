import { Ajv } from 'ajv';
import type {
  ErrorObject,
  SchemaObject,
  ValidateFunction,
} from 'ajv';
import type { AST, Rule } from 'eslint';
import { isMap, isNode, isScalar, isSeq } from 'yaml';
import type { Document, LineCounter, Node, Pair, YAMLMap } from 'yaml';
import { parseMarkdown, toEslintLoc } from '#src/parse.js';

interface SchemaRuleOptions {
  readonly schema: SchemaObject;
}

const ruleOptionsSchema = [
  {
    additionalProperties: false,
    properties: {
      schema: { additionalProperties: true, type: 'object' },
    },
    required: ['schema'],
    type: 'object',
  },
];

/*
 * Single Ajv instance reused across rule invocations. Compiled validators
 * are cached by schema-object identity so a stable rule config compiles
 * once per ESLint run. `validateSchema: false` skips the meta-schema
 * lookup so user schemas can reference any `$schema` URL (or omit it)
 * without forcing us to register the corresponding meta-schema.
 */
const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false,
});
const compileCache = new WeakMap<object, ValidateFunction>();

const compile = (schema: SchemaObject): ValidateFunction => {
  const cached = compileCache.get(schema);
  if (cached) return cached;
  const validate = ajv.compile(schema);
  compileCache.set(schema, validate);
  return validate;
};

const decodeJsonPointer = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~');

const splitInstancePath = (path: string): readonly string[] => {
  if (path === '') return [];
  return path.split('/').slice(1).map(decodeJsonPointer);
};

const findPairByKey = (
  map: YAMLMap,
  key: string,
): Pair | undefined =>
  map.items.find(
    item => isScalar(item.key) && String(item.key.value) === key,
  );

const findNode = (
  root: Node | undefined,
  segments: readonly string[],
): Node | undefined => {
  let current: Node | undefined = root;
  for (const seg of segments) {
    if (!current) return undefined;
    if (isMap(current)) {
      const next = findPairByKey(current, seg)?.value;
      current = isNode(next) ? next : undefined;
    } else if (isSeq(current)) {
      const index = Number(seg);
      if (!Number.isInteger(index)) return undefined;
      const next = current.items[index];
      current = isNode(next) ? next : undefined;
    } else {
      return undefined;
    }
  }
  return current;
};

const findChildKeyInMap = (
  root: Node | undefined,
  segments: readonly string[],
  childKey: string,
): Node | undefined => {
  const parent = findNode(root, segments);
  if (!parent || !isMap(parent)) return undefined;
  const keyNode = findPairByKey(parent, childKey)?.key;
  return isNode(keyNode) ? keyNode : undefined;
};

const locateNode = (
  lineCounter: LineCounter,
  contentOffset: number,
  node: Node | undefined,
  fallback: AST.SourceLocation,
): AST.SourceLocation => {
  if (!node?.range) return fallback;
  const [start, end] = node.range;
  return {
    end: toEslintLoc(lineCounter, contentOffset + end),
    start: toEslintLoc(lineCounter, contentOffset + start),
  };
};

const pathLabel = (segments: readonly string[]): string =>
  ['frontmatter', ...segments].join('.');

interface ReportContext {
  readonly contentOffset: number;
  readonly context: Rule.RuleContext;
  readonly document: Document.Parsed;
  readonly fallbackLoc: AST.SourceLocation;
  readonly lineCounter: LineCounter;
}

const reportError = (ctx: ReportContext, error: ErrorObject): void => {
  const root = ctx.document.contents ?? undefined;
  const segments = splitInstancePath(error.instancePath);

  let target: Node | undefined;
  let label: string;

  if (error.keyword === 'additionalProperties') {
    /* ajv types `error.params` as `Record<string, any>`; the
       `additionalProperties` keyword always populates this shape. */
    const additionalProperty = String(
      (error.params as { additionalProperty: unknown }).additionalProperty,
    );
    target = findChildKeyInMap(root, segments, additionalProperty);
    label = pathLabel([...segments, additionalProperty]);
  } else {
    target = findNode(root, segments);
    label = pathLabel(segments);
  }

  ctx.context.report({
    loc: locateNode(ctx.lineCounter, ctx.contentOffset, target, ctx.fallbackLoc),
    message: `\`${label}\` ${error.message ?? 'is invalid'}`,
  });
};

/**
 * Validates Markdown YAML frontmatter against a JSON Schema provided in
 * the rule options. Reports each Ajv error with a source location
 * pointing at the offending YAML node.
 */
export const schema: Rule.RuleModule = {
  meta: {
    schema: ruleOptionsSchema,
    type: 'problem',
  },

  create(context) {
    return {
      // Key off the actual AST root so this fires under any markdown
      // parser or language (e.g. @eslint/markdown's `root` mdast node).
      [context.sourceCode.ast.type]() {
        const options = context.options[0] as SchemaRuleOptions | undefined;
        if (!options) return;

        const validate = compile(options.schema);
        const text = context.sourceCode.getText();
        const { frontmatter, lineCounter } = parseMarkdown(
          context.sourceCode,
          text,
        );

        if (!frontmatter) {
          context.report({
            loc: {
              end: { column: 0, line: 1 },
              start: { column: 0, line: 1 },
            },
            message:
              'Markdown file must begin with YAML frontmatter delimited by `---`',
          });
          return;
        }

        const data: unknown = frontmatter.document.toJS();
        if (validate(data)) return;

        const errors = validate.errors ?? [];
        const fallbackLoc: AST.SourceLocation = {
          end: toEslintLoc(lineCounter, frontmatter.endOffset),
          start: toEslintLoc(lineCounter, frontmatter.contentOffset),
        };

        for (const error of errors) {
          reportError(
            {
              context,
              contentOffset: frontmatter.contentOffset,
              document: frontmatter.document,
              fallbackLoc,
              lineCounter,
            },
            error,
          );
        }
      },
    };
  },
};
