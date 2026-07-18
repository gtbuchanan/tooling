import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sarifFormat from '@microsoft/eslint-formatter-sarif';

/** SARIF log path written by the formatter, relative to the lint cwd. */
export const sarifOutputPath = 'dist/eslint.sarif';

/** Structural subset of an ESLint lint message the console output needs. */
export interface FormatterMessage {
  readonly column: number;
  readonly line: number;
  readonly message: string;
  readonly ruleId: string | null;
  readonly severity: number;
}

/** Structural subset of an ESLint lint result the console output needs. */
export interface FormatterResult {
  readonly filePath: string;
  readonly messages: readonly FormatterMessage[];
}

/** ESLint's numeric severity for an error (1 is a warning). */
const errorSeverity = 2;

/** Builds compact per-violation console output (one line per message). */
export const formatConsole = (results: readonly FormatterResult[]): string => {
  const lines = results.flatMap(result =>
    result.messages.map((message) => {
      const severity = message.severity === errorSeverity ? 'error' : 'warning';
      const rule = message.ruleId ?? 'internal';
      const position = `${String(message.line)}:${String(message.column)}`;
      return `${result.filePath}:${position}  ${severity}  ${message.message}  ${rule}`;
    }),
  );
  if (lines.length === 0) {
    return '';
  }
  const problems = `${String(lines.length)} problem${lines.length === 1 ? '' : 's'}`;
  return `${lines.join('\n')}\n\n✖ ${problems}\n`;
};

/**
 * ESLint formatter that writes a SARIF log to {@link sarifOutputPath}
 * (for the CI lint regression compare) and returns compact console
 * output. ESLint accepts a single `--format`, so the side-effecting
 * file write is how one run feeds both consumers.
 */
const eslintSarifFormatter = (
  results: readonly FormatterResult[],
  data?: unknown,
): string => {
  const outputFile = path.resolve(sarifOutputPath);
  mkdirSync(path.dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, sarifFormat(results, data));
  return formatConsole(results);
};

export default eslintSarifFormatter;
