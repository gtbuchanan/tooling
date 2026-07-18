import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as v from 'valibot';
import { readJsonFile } from './file-writer.ts';
import { type Logger, createLogger } from './logger.ts';
import { type RunOptions, run } from './process.ts';
import { type WorkspaceContext, resolveWorkspace } from './workspace.ts';

/** SARIF artifact filenames under a lint cwd's `dist/`. */
export const sarifFileNames = {
  base: 'eslint-base.sarif',
  current: 'eslint.sarif',
  matched: 'eslint-matched.sarif',
} as const;

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

const SarifResultSchema = v.object({
  baselineState: v.optional(v.string()),
  level: v.optional(v.string()),
  locations: v.optional(v.array(SarifLocationSchema)),
  message: v.object({ text: v.string() }),
  ruleId: v.optional(v.string()),
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

/** A lint violation present in HEAD but not matched to the baseline. */
export interface NewViolation {
  readonly column: number | undefined;
  readonly level: string;
  readonly line: number | undefined;
  readonly message: string;
  readonly ruleId: string;
  readonly uri: string;
}

interface LocationParts {
  readonly column: number | undefined;
  readonly line: number | undefined;
  readonly uri: string | undefined;
}

const toLocationParts = (result: SarifResult): LocationParts => {
  const location = result.locations?.[0]?.physicalLocation;
  return {
    column: location?.region?.startColumn,
    line: location?.region?.startLine,
    uri: location?.artifactLocation?.uri,
  };
};

const toNewViolation = (result: SarifResult): NewViolation => {
  const { column, line, uri } = toLocationParts(result);
  return {
    column,
    level: result.level ?? 'error',
    line,
    message: result.message.text,
    ruleId: result.ruleId ?? 'internal',
    uri: uri ?? '<unknown>',
  };
};

/** Extracts results the baseliner classified as `new`. */
export const extractNewViolations = (log: SarifLog): readonly NewViolation[] =>
  log.runs.flatMap(run_ =>
    (run_.results ?? [])
      .filter(result => result.baselineState === 'new')
      .map(toNewViolation),
  );

const formatPosition = (violation: NewViolation): string => {
  if (violation.line === undefined) return '';
  const column = violation.column === undefined ? '' : `:${String(violation.column)}`;
  return `:${String(violation.line)}${column}`;
};

const formatViolation = (violation: NewViolation): string => {
  const { level, message, ruleId, uri } = violation;
  return `${uri}${formatPosition(violation)}  ${level}  ${message}  ${ruleId}`;
};

/** Renders new violations for console output, one line per violation. */
export const formatNewViolations = (
  violations: readonly NewViolation[],
): string => violations.map(formatViolation).join('\n');

/**
 * Side-effecting I/O the compare depends on. Injected so the
 * orchestration (per-package matching, gating) is unit-testable without
 * spawning the SARIF multitool.
 */
export interface LintCompareDeps {
  readonly exists: (filePath: string) => boolean;
  readonly logger: Logger;
  readonly readJson: (filePath: string) => unknown;
  readonly resolveMultitool: () => string;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
  readonly workspace: () => WorkspaceContext;
}

/**
 * The multitool npm package exports the path to its platform-specific
 * self-contained binary. Resolved lazily (and spawned directly, skipping
 * the package's `shell: true` bin shim) so merely loading the CLI never
 * requires the optional platform package.
 */
const resolveMultitoolBinary = (): string => {
  const require = createRequire(import.meta.url);
  return v.parse(v.string(), require('@microsoft/sarif-multitool'));
};

const defaultDeps: LintCompareDeps = {
  exists: existsSync,
  logger: createLogger(),
  readJson: readJsonFile,
  resolveMultitool: resolveMultitoolBinary,
  run,
  workspace: resolveWorkspace,
};

const matchDirForward = async (
  dir: string,
  deps: LintCompareDeps,
): Promise<readonly NewViolation[]> => {
  const distDir = path.join(dir, 'dist');
  const current = path.join(distDir, sarifFileNames.current);
  if (!deps.exists(current)) {
    return [];
  }
  const base = path.join(distDir, sarifFileNames.base);
  if (!deps.exists(base)) {
    deps.logger.error(`No baseline SARIF for ${dir}; skipping`);
    return [];
  }
  const matched = path.join(distDir, sarifFileNames.matched);
  await deps.run(deps.resolveMultitool(), {
    args: [
      'match-results-forward', current,
      '--previous', base,
      '--output-file-path', matched,
      // Reruns are routine (retries, local iteration); replace stale output.
      '--log', 'ForceOverwrite',
    ],
  });
  const log = parseSarifLog(deps.readJson(matched));
  return extractNewViolations(log);
};

/**
 * Compares each lint cwd's current SARIF log against its baseline via
 * `sarif-multitool match-results-forward` and rejects when any result
 * is classified `new`. Matching is fingerprint/content-based, so
 * baseline violations that merely moved (edits above them) stay
 * matched — only genuine regressions gate.
 */
export const executeLintEslintCompare = async (
  deps: LintCompareDeps = defaultDeps,
): Promise<void> => {
  const { packageDirs, rootDir } = deps.workspace();
  const lintDirs = [...new Set([rootDir, ...packageDirs])];
  const violations: NewViolation[] = [];

  for (const dir of lintDirs) {
    violations.push(...await matchDirForward(dir, deps));
  }

  if (violations.length > 0) {
    deps.logger.error(formatNewViolations(violations));
    throw new Error(
      `${String(violations.length)} new lint violation(s) not present in the baseline`,
    );
  }
  deps.logger.info('No new lint violations');
};
