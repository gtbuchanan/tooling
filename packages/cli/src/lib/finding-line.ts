/** Parts of a lint finding the console line renders. */
export interface FindingLine {
  readonly column: number | undefined;
  readonly level: string;
  readonly line: number | undefined;
  readonly message: string;
  readonly ruleId: string;
  readonly uri: string;
}

const formatPosition = (
  line: number | undefined,
  column: number | undefined,
): string => {
  if (line === undefined) return '';
  const columnPart = column === undefined ? '' : `:${String(column)}`;
  return `:${String(line)}${columnPart}`;
};

/**
 * Renders the one-line console form of a finding:
 * `<file>:<line>:<col>  <level>  <message>  <rule>`. Shared by the
 * ESLint formatter's console output and the compare's new-findings
 * report so lint output and the CI gate read identically.
 *
 * Kept dependency-free: the ESLint formatter imports this from inside
 * the ESLint process.
 */
export const formatFindingLine = (finding: FindingLine): string => {
  const position = formatPosition(finding.line, finding.column);
  const { level, message, ruleId, uri } = finding;
  return `${uri}${position}  ${level}  ${message}  ${ruleId}`;
};
