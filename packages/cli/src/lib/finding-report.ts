/** Parts of a lint finding the console report renders. */
export interface Finding {
  readonly column: number | undefined;
  readonly level: string;
  readonly line: number | undefined;
  readonly message: string;
  readonly ruleId: string;
  readonly uri: string;
}

/** Style names the report applies (a subset of `util.styleText` formats). */
export type FindingStyleName = 'bold' | 'dim' | 'red' | 'underline' | 'yellow';

/**
 * Applies terminal styling to a report part. `util.styleText` satisfies
 * this directly, keeping color detection (TTY, `NO_COLOR`,
 * `FORCE_COLOR`) with the caller and the renderer pure.
 */
export type StyleText = (format: FindingStyleName, text: string) => string;

/** Identity style: plain (uncolored) report text. */
export const plainText: StyleText = (_format, text) => text;

const width = (parts: readonly string[]): number =>
  Math.max(0, ...parts.map(part => part.length));

/**
 * `line:col` with the line right-aligned so the colons line up within a
 * file section (the ESLint `stylish` convention). Empty when the
 * finding has no line (e.g. a SARIF result without a region).
 */
const formatPosition = (finding: Finding, lineWidth: number): string => {
  if (finding.line === undefined) return '';
  const line = String(finding.line).padStart(lineWidth);
  return finding.column === undefined ? line : `${line}:${String(finding.column)}`;
};

const count = (total: number, noun: string): string =>
  `${String(total)} ${noun}${total === 1 ? '' : 's'}`;

const formatSection = (
  uri: string,
  group: readonly Finding[],
  style: StyleText,
): string => {
  const lineWidth = width(group.map(finding =>
    finding.line === undefined ? '' : String(finding.line)));
  const positions = group.map(finding => formatPosition(finding, lineWidth));
  const positionWidth = width(positions);
  const levelWidth = width(group.map(finding => finding.level));
  const messageWidth = width(group.map(finding => finding.message));
  const rows = group.map((finding, index) => {
    const position = positions[index] ?? '';
    const cells = [
      ...positionWidth === 0
        ? []
        : [style('dim', position.padEnd(positionWidth))],
      style(
        finding.level === 'error' ? 'red' : 'yellow',
        finding.level.padEnd(levelWidth),
      ),
      finding.message.padEnd(messageWidth),
      style('dim', finding.ruleId),
    ];
    return `  ${cells.join('  ')}`;
  });
  return [style('underline', uri), ...rows].join('\n');
};

/**
 * Renders findings in the ESLint `stylish` layout: per-file sections
 * with aligned position/level/message columns, then a problem-count
 * summary. Shared by the `lint:eslint` console output and the SARIF
 * compare's new-findings report so lint output and the CI gate read
 * identically.
 */
export const formatFindingReport = (
  findings: readonly Finding[],
  style: StyleText = plainText,
): string => {
  if (findings.length === 0) return '';
  const sections = [...Map.groupBy(findings, finding => finding.uri)]
    .map(([uri, group]) => formatSection(uri, group, style));
  const errors = findings.filter(finding => finding.level === 'error').length;
  const summary = style('bold', style(
    errors > 0 ? 'red' : 'yellow',
    `✖ ${count(findings.length, 'problem')} ` +
    `(${count(errors, 'error')}, ${count(findings.length - errors, 'warning')})`,
  ));
  return `${sections.join('\n\n')}\n\n${summary}`;
};
