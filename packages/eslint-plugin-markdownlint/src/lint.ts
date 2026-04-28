import type { AST, Rule } from 'eslint';
import type { Configuration, LintError } from 'markdownlint';
import { lint as lintSync } from 'markdownlint/sync';

/** Converts a markdownlint `LintError` to an ESLint location object. */
const getLocation = (error: LintError): AST.SourceLocation | { column: number; line: number } => {
  const line = error.lineNumber;
  if (error.errorRange) {
    const [column, length] = error.errorRange as [number, number];
    return {
      end: { column: column - 1 + length, line },
      start: { column: column - 1, line },
    };
  }
  return { column: 0, line };
};

/** Formats the diagnostic message from a markdownlint error. */
const formatMessage = (error: LintError): string => {
  const names = error.ruleNames.join('/');
  const detail = error.errorDetail ? `: ${error.errorDetail}` : '';
  const context = error.errorContext ? ` [Context: "${error.errorContext}"]` : '';
  return `${names} - ${error.ruleDescription}${detail}${context}`;
};

/**
 * Pre-computes a prefix-sum array of byte offsets for each line start.
 * `lineOffsets[i]` is the character offset where line `i` (0-based) begins.
 */
const buildLineOffsets = (lines: readonly string[]): readonly number[] => {
  const offsets: number[] = [0];
  let offset = 0;
  for (const line of lines.slice(0, -1)) {
    offset += line.length + 1;
    offsets.push(offset);
  }
  return offsets;
};

/**
 * Converts markdownlint `fixInfo` into an ESLint fixer callback.
 * Returns `undefined` when the error has no fix information.
 */
const createFix = (
  error: LintError,
  lines: readonly string[],
  lineOffsets: readonly number[],
): ((fixer: Rule.RuleFixer) => Rule.Fix) | undefined => {
  const { fixInfo } = error;
  if (!fixInfo) return undefined;

  return (fixer) => {
    const fixLine = (fixInfo.lineNumber ?? error.lineNumber) - 1;
    const lineStart = lineOffsets[fixLine];
    if (lineStart === undefined) {
      const actual = String(fixLine + 1);
      const total = String(lineOffsets.length);
      throw new RangeError(
        `fixInfo references line ${actual} but file has ${total} lines`,
      );
    }

    if (fixInfo.deleteCount === -1) {
      /*
       * deleteCount -1 means delete the entire line. Compute the
       * range spanning from this line's start to the next line's
       * start (consuming the newline).
       */
      const lineEnd = lineStart + (lines[fixLine]?.length ?? 0) + 1;
      return fixer.replaceTextRange([lineStart, lineEnd], fixInfo.insertText ?? '');
    }

    const col = (fixInfo.editColumn ?? 1) - 1;
    const start = lineStart + col;
    const end = start + (fixInfo.deleteCount ?? 0);
    return fixer.replaceTextRange([start, end], fixInfo.insertText ?? '');
  };
};

/** ESLint rule that runs markdownlint on the file content. */
export const lint: Rule.RuleModule = {
  meta: {
    fixable: 'code',
    schema: [{ type: 'object' }],
    type: 'problem',
  },

  create(context) {
    return {
      // Key off the actual AST root so this fires under any markdown
      // parser or language (e.g. @eslint/markdown's `root` mdast node).
      [context.sourceCode.ast.type]() {
        const config = (context.options[0] ?? {}) as Configuration;
        const text = context.sourceCode.getText();
        const lines = text.split(/\r\n?|\n/v);
        const lineOffsets = buildLineOffsets(lines);

        const results = lintSync({
          config,
          strings: { content: text },
        });

        for (const error of results['content'] ?? []) {
          const fix = createFix(error, lines, lineOffsets);
          context.report({
            ...(fix !== undefined && { fix }),
            loc: getLocation(error),
            message: formatMessage(error),
          });
        }
      },
    };
  },
};
