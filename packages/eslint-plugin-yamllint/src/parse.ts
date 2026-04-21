import { LineCounter, parseAllDocuments } from 'yaml';
import type { Document } from 'yaml';

interface ParseResult {
  readonly documents: readonly Document.Parsed[];
  readonly lineCounter: LineCounter;
}

const cache = new WeakMap<object, ParseResult>();

/**
 * Parses YAML text into documents, cached per ESLint source scope.
 * Uses `context.sourceCode` as the cache key so multiple rules
 * share a single parse per file.
 */
export const parseYaml = (
  cacheKey: object,
  text: string,
): ParseResult => {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const lineCounter = new LineCounter();
  const documents = parseAllDocuments(text, { lineCounter });

  const result: ParseResult = { documents, lineCounter };
  cache.set(cacheKey, result);
  return result;
};

/**
 * Converts a yaml `LineCounter` offset to an ESLint source location.
 * The yaml package uses 1-based columns; ESLint uses 0-based.
 */
export const toEslintLoc = (
  lineCounter: LineCounter,
  offset: number,
): { column: number; line: number } => {
  const pos = lineCounter.linePos(offset);
  return { column: pos.col - 1, line: pos.line };
};
