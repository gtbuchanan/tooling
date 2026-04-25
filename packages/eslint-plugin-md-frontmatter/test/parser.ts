import type { Linter } from 'eslint';

/**
 * Minimal ESLint parser for Markdown test files. Produces a `Program`
 * AST node with the raw source text accessible via `context.sourceCode`.
 */
export const parseForESLint = (code: string): Linter.ESLintParseResult => {
  const lines = code.split(/\r\n?|\n/v);
  const lastLine = lines.at(-1) ?? '';

  return {
    ast: {
      body: [],
      comments: [],
      loc: {
        end: { column: lastLine.length, line: lines.length },
        start: { column: 0, line: 1 },
      },
      range: [0, code.length] as [number, number],
      sourceType: 'module',
      tokens: [],
      type: 'Program' as const,
    },
    scopeManager: undefined,
    visitorKeys: {},
  };
};

/** Parser metadata. */
export const meta = {
  name: '@gtbuchanan/eslint-plugin-md-frontmatter/test-parser',
};
