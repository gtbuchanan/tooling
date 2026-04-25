import { LineCounter, parseDocument } from 'yaml';
import type { Document } from 'yaml';

const frontmatterPattern =
  /^(?<opener>---\r?\n)(?<content>[\s\S]*?)\r?\n---(?:\r?\n|$)/v;

/** Position info for a parsed YAML frontmatter block. */
export interface ParsedFrontmatter {
  readonly document: Document.Parsed;
  /** Offset in the source where the frontmatter content begins (after opening `---`). */
  readonly contentOffset: number;
  /** Offset in the source where the closing `---` line ends. */
  readonly endOffset: number;
}

/** Result of parsing a Markdown file with optional YAML frontmatter. */
export interface ParsedMarkdown {
  readonly lineCounter: LineCounter;
  readonly frontmatter: ParsedFrontmatter | undefined;
}

const cache = new WeakMap<object, ParsedMarkdown>();

const buildLineCounter = (text: string): LineCounter => {
  /* yaml's LineCounter expects each call to register the first
     character of a new line (one past the `\n`), with line 1 seeded
     at offset 0 — matches what yaml's own Parser does internally. */
  const lc = new LineCounter();
  lc.addNewLine(0);
  let offset = text.indexOf('\n');
  while (offset !== -1) {
    lc.addNewLine(offset + 1);
    offset = text.indexOf('\n', offset + 1);
  }
  return lc;
};

/**
 * Parses Markdown frontmatter, cached per ESLint source scope. Uses
 * `context.sourceCode` as the cache key so multiple rules share a
 * single parse per file.
 */
export const parseMarkdown = (
  cacheKey: object,
  text: string,
): ParsedMarkdown => {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const lineCounter = buildLineCounter(text);
  const match = frontmatterPattern.exec(text);

  let frontmatter: ParsedFrontmatter | undefined;
  if (match) {
    const opener = match.groups?.['opener'] ?? '';
    const content = match.groups?.['content'] ?? '';
    frontmatter = {
      contentOffset: opener.length,
      document: parseDocument(content),
      endOffset: match[0].length,
    };
  }

  const result: ParsedMarkdown = { frontmatter, lineCounter };
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
