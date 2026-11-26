import type { ESLint, Linter, Rule } from 'eslint';
import { toPosixRelative } from '#src/core/paths.js';
import { localeComparer } from '#src/core/sort.js';

/*
 * ESLint's result types, loosened where its declarations promise more than
 * ESLint delivers: a finding about a whole file, such as the warning for an
 * ignored one, carries no line or column, and a rule declaring no `meta`
 * leaves its entry in `rulesMeta` undefined. ESLint's own results are
 * assignable to these.
 */

type Positionless<Message extends Linter.LintMessage> =
  Omit<Message, 'column' | 'line'> & Partial<Pick<Message, 'column' | 'line'>>;

/**
 * One finding ESLint reported.
 */
export type LintMessage = Positionless<Linter.LintMessage>;

/**
 * A finding a directive or ESLint's bulk suppressions file suppressed.
 */
export type SuppressedLintMessage = Positionless<Linter.SuppressedLintMessage>;

/**
 * What ESLint reported for one file.
 */
export type LintResult = Omit<ESLint.LintResult, 'messages' | 'suppressedMessages'> & {
  readonly messages: readonly LintMessage[];
  readonly suppressedMessages: readonly SuppressedLintMessage[];
};

/**
 * Where a SARIF log's URIs resolve from, and what the rules that fired mean.
 */
export interface SarifContext {
  /**
   * The repository root, which every location is made relative to.
   */
  readonly rootDir: string;
  readonly rulesMeta: Readonly<Record<string, Rule.RuleMetaData | undefined>>;
}

interface SarifRegion {
  readonly endColumn?: number;
  readonly endLine?: number;
  readonly startColumn?: number;
  readonly startLine: number;
}

interface SarifSuppression {
  readonly justification: string;
  readonly kind: 'external' | 'inSource';
}

interface SarifResult {
  readonly level: 'error' | 'warning';
  readonly locations: readonly [{
    readonly physicalLocation: {
      readonly artifactLocation: { readonly uri: string; readonly uriBaseId: string };
      readonly region?: SarifRegion;
    };
  }];
  readonly message: { readonly text: string };
  readonly ruleId?: string;
  readonly suppressions?: readonly SarifSuppression[];
}

interface SarifRule {
  readonly helpUri?: string;
  readonly id: string;
  readonly shortDescription?: { readonly text: string };
}

interface SarifRun {
  readonly results: readonly SarifResult[];
  readonly tool: {
    readonly driver: {
      readonly informationUri: string;
      readonly name: string;
      readonly rules: readonly SarifRule[];
    };
  };
}

/**
 * The subset of a SARIF 2.1.0 log gtb writes.
 */
export interface SarifLog {
  readonly $schema: string;
  readonly runs: readonly SarifRun[];
  readonly version: '2.1.0';
}

/*
 * Locations are relative to the repository root under `SRCROOT`, which code
 * scanning resolves to the checkout. The base carries no `uri`: an absolute
 * path would tie the log to the machine that wrote it, and turbo replays it on
 * others.
 */
const srcRoot = 'SRCROOT';

/*
 * ESLint's numeric severity for an error; 1 is a warning, and a message never
 * carries 0, since an `off` rule reports nothing.
 */
const errorSeverity = 2;

/*
 * SARIF requires a region to start on a line, counted from 1, so a finding
 * about the whole file gets none: ESLint gives one no line at all, or line 0,
 * as in its own "No matching configuration" warning.
 */
const regionOf = (
  { column, endColumn, endLine, line }: LintMessage,
): { readonly region?: SarifRegion } => (line === undefined || line < 1
  ? {}
  : {
      region: {
        ...(endColumn !== undefined && { endColumn }),
        ...(endLine !== undefined && { endLine }),
        ...(column !== undefined && { startColumn: column }),
        startLine: line,
      },
    });

/*
 * SARIF reads `{n}` in message text as a placeholder for an argument, and the
 * log passes none, so a literal brace is doubled.
 */
const escapeBraces = (text: string): string =>
  text.replaceAll('{', '{{').replaceAll('}', '}}');

const toResult = (uri: string, message: LintMessage): SarifResult => ({
  level: message.severity === errorSeverity ? 'error' : 'warning',
  locations: [{
    physicalLocation: {
      artifactLocation: { uri, uriBaseId: srcRoot },
      ...regionOf(message),
    },
  }],
  message: { text: escapeBraces(message.message) },
  ...(message.ruleId !== null && { ruleId: message.ruleId }),
});

/*
 * ESLint suppresses a finding through a directive in the source, or through
 * its bulk suppressions file (`file`), which SARIF counts as external.
 */
const toSuppression = (
  { justification, kind }: SuppressedLintMessage['suppressions'][number],
): SarifSuppression => ({ justification, kind: kind === 'directive' ? 'inSource' : 'external' });

/*
 * Identical directives over one line each suppress the finding, and SARIF
 * requires a result's suppressions to be unique, so a repeat is dropped.
 */
const uniqueSuppressions = (
  suppressions: readonly SarifSuppression[],
): readonly SarifSuppression[] =>
  new Map(suppressions.map(suppression => [JSON.stringify(suppression), suppression]))
    .values()
    .toArray();

const toRule = (id: string, meta: Rule.RuleMetaData | undefined): SarifRule => ({
  ...(meta?.docs?.url !== undefined && { helpUri: meta.docs.url }),
  id,
  ...(meta?.docs?.description !== undefined &&
    { shortDescription: { text: meta.docs.description } }),
});

/*
 * Only the rules that fired, which is what ESLint's `rulesMeta` holds, sorted
 * so the log doesn't change with the order files were linted in.
 */
const rulesOf = (rulesMeta: SarifContext['rulesMeta']): readonly SarifRule[] =>
  Object.entries(rulesMeta)
    .toSorted(([left], [right]) => localeComparer(left, right))
    .map(([id, meta]) => toRule(id, meta));

/*
 * A relative path as the URI reference SARIF locates a file by. Each segment
 * is percent-encoded, since a `#` would otherwise start a fragment and a `%`
 * an escape, while `/` stays the separator.
 */
const toUriReference = (relativePath: string): string =>
  relativePath.split('/').map(segment => encodeURIComponent(segment)).join('/');

const resultsOf = (
  { filePath, messages, suppressedMessages }: LintResult,
  rootDir: string,
): readonly SarifResult[] => {
  const uri = toUriReference(toPosixRelative(rootDir, filePath));

  return [
    ...messages.map(message => toResult(uri, message)),
    ...suppressedMessages.map(message => ({
      ...toResult(uri, message),
      suppressions: uniqueSuppressions(message.suppressions.map(toSuppression)),
    })),
  ];
};

/**
 * Converts ESLint's results into a SARIF 2.1.0 log.
 */
export const toSarifLog = (
  results: readonly LintResult[],
  { rootDir, rulesMeta }: SarifContext,
): SarifLog => ({
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  runs: [{
    results: results.flatMap(result => resultsOf(result, rootDir)),
    tool: {
      driver: {
        informationUri: 'https://eslint.org',
        name: 'ESLint',
        rules: rulesOf(rulesMeta),
      },
    },
  }],
  version: '2.1.0',
});
