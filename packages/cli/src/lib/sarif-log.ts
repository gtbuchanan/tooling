import * as v from 'valibot';
import type { Finding } from './finding-report.ts';
import { internalRuleId } from './internal-rule-id.ts';

const SarifRegionSchema = v.object({
  startColumn: v.optional(v.number()),
  startLine: v.optional(v.number()),
});

const SarifArtifactLocationSchema = v.object({
  uri: v.optional(v.string()),
});

const SarifPhysicalLocationSchema = v.object({
  artifactLocation: v.optional(SarifArtifactLocationSchema),
  region: v.optional(SarifRegionSchema),
});

const SarifLocationSchema = v.object({
  physicalLocation: v.optional(SarifPhysicalLocationSchema),
});

const SarifSuppressionsSchema = v.array(v.unknown());

const SarifResultSchema = v.object({
  baselineState: v.optional(v.string()),
  level: v.optional(v.string()),
  locations: v.optional(v.array(SarifLocationSchema)),
  message: v.object({ text: v.string() }),
  ruleId: v.optional(v.string()),
  suppressions: v.optional(SarifSuppressionsSchema),
});

const SarifRunSchema = v.object({
  results: v.optional(v.array(SarifResultSchema)),
});

const SarifLogSchema = v.object({
  runs: v.array(SarifRunSchema),
});

/** Parsed subset of a SARIF log the compare consumes. */
export type SarifLog = v.InferOutput<typeof SarifLogSchema>;

type SarifResult = v.InferOutput<typeof SarifResultSchema>;

/** Validates untrusted JSON as a {@link SarifLog}. */
export const parseSarifLog = (data: unknown): SarifLog =>
  v.parse(SarifLogSchema, data);

/** A finding present in HEAD but not matched to the baseline. */
export type NewFinding = Finding;

interface LocationParts {
  readonly column: number | undefined;
  readonly line: number | undefined;
  readonly uri: string | undefined;
}

// Split out of toNewFinding to keep its complexity within the lint limit.
const toLocationParts = (result: SarifResult): LocationParts => {
  const location = result.locations?.[0]?.physicalLocation;
  return {
    column: location?.region?.startColumn,
    line: location?.region?.startLine,
    uri: location?.artifactLocation?.uri,
  };
};

const toNewFinding = (result: SarifResult): NewFinding => {
  const { column, line, uri } = toLocationParts(result);
  return {
    column,
    level: result.level ?? 'error',
    line,
    message: result.message.text,
    ruleId: result.ruleId ?? internalRuleId,
    uri: uri ?? '<unknown>',
  };
};

/**
 * Suppressed findings (e.g. reasoned `eslint-disable` comments) are
 * exempt from the gate: an in-source suppression is already the
 * accepted mechanism for carrying a finding, reviewed with the code.
 * They stay in the SARIF logs for visibility; they just never block.
 */
const isUnsuppressed = (result: SarifResult): boolean =>
  (result.suppressions ?? []).length === 0;

const extractFindings = (
  log: SarifLog,
  isIncluded: (result: SarifResult) => boolean,
): readonly NewFinding[] =>
  log.runs.flatMap(run =>
    (run.results ?? [])
      .filter(isUnsuppressed)
      .filter(isIncluded)
      .map(toNewFinding),
  );

/** Extracts unsuppressed results the baseliner classified as `new`. */
export const extractNewFindings = (log: SarifLog): readonly NewFinding[] =>
  extractFindings(log, result => result.baselineState === 'new');

/**
 * Extracts every unsuppressed result — the classification of a log
 * whose baseline is empty (all findings are new by definition).
 */
export const extractAllFindings = (log: SarifLog): readonly NewFinding[] =>
  extractFindings(log, () => true);
