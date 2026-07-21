import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as v from 'valibot';
import { readJsonFile } from './file-writer.ts';
import { type Logger, createLogger } from './logger.ts';
import { type RunOptions, capture, run } from './process.ts';
import { sarifPaths } from './sarif-paths.ts';
import { localeComparer } from './sort.ts';
import { type WorkspaceContext, resolveWorkspace } from './workspace.ts';

export { sarifPaths } from './sarif-paths.ts';

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
export interface NewFinding {
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

const toNewFinding = (result: SarifResult): NewFinding => {
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

/**
 * Suppressed findings (e.g. reasoned `eslint-disable` comments) are
 * exempt from the gate: an in-source suppression is already the
 * accepted mechanism for carrying a finding, reviewed with the code.
 * They stay in the SARIF logs for visibility; they just never block.
 */
const isUnsuppressed = (result: SarifResult): boolean =>
  (result.suppressions ?? []).length === 0;

/** Extracts unsuppressed results the baseliner classified as `new`. */
export const extractNewFindings = (log: SarifLog): readonly NewFinding[] =>
  log.runs.flatMap(run_ =>
    (run_.results ?? [])
      .filter(isUnsuppressed)
      .filter(result => result.baselineState === 'new')
      .map(toNewFinding),
  );

/**
 * Extracts every unsuppressed result — the classification of a log
 * whose baseline is empty (all findings are new by definition).
 */
export const extractAllFindings = (log: SarifLog): readonly NewFinding[] =>
  log.runs.flatMap(run_ =>
    (run_.results ?? []).filter(isUnsuppressed).map(toNewFinding),
  );

const formatPosition = (finding: NewFinding): string => {
  if (finding.line === undefined) return '';
  const column = finding.column === undefined ? '' : `:${String(finding.column)}`;
  return `:${String(finding.line)}${column}`;
};

const formatFinding = (finding: NewFinding): string => {
  const { level, message, ruleId, uri } = finding;
  return `${uri}${formatPosition(finding)}  ${level}  ${message}  ${ruleId}`;
};

/** Renders new findings for console output, one line per finding. */
export const formatNewFindings = (
  findings: readonly NewFinding[],
): string => findings.map(formatFinding).join('\n');

/**
 * Side-effecting I/O the compare depends on. Injected so the
 * orchestration (baseline production, per-package matching, gating) is
 * unit-testable without spawning git, turbo, or the SARIF multitool.
 */
export interface SarifCompareDeps {
  readonly capture: (command: string, args: readonly string[]) => Promise<string>;
  readonly copyFile: (source: string, destination: string) => void;
  readonly ensureDir: (dir: string) => void;
  readonly exists: (filePath: string) => boolean;
  /** Names of `*.sarif` files directly in `dir` (empty when missing). */
  readonly list: (dir: string) => readonly string[];
  readonly logger: Logger;
  readonly makeTempDir: () => string;
  readonly readJson: (filePath: string) => unknown;
  readonly readText: (filePath: string) => string;
  readonly remove: (filePath: string) => void;
  readonly resolveMultitool: () => string;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
  readonly workspace: (cwd?: string) => WorkspaceContext;
  readonly writeText: (filePath: string, content: string) => void;
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

const listSarifFiles = (dir: string): readonly string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.sarif'))
    .map(entry => entry.name)
    .toSorted(localeComparer);
};

const defaultDeps: SarifCompareDeps = {
  capture,
  copyFile: (source, destination) => {
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  },
  ensureDir: (dir) => {
    mkdirSync(dir, { recursive: true });
  },
  exists: existsSync,
  list: listSarifFiles,
  logger: createLogger(),
  makeTempDir: () => mkdtempSync(path.join(tmpdir(), 'gtb-sarif-base-')),
  readJson: readJsonFile,
  readText: filePath => readFileSync(filePath, 'utf8'),
  remove: (filePath) => {
    rmSync(filePath, { force: true, recursive: true });
  },
  resolveMultitool: resolveMultitoolBinary,
  run,
  workspace: cwd => resolveWorkspace(cwd === undefined ? undefined : { cwd }),
  writeText: (filePath, content) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  },
};

/** Absolute path of the baseline stamp file for the head workspace. */
const baselineStampPath = (deps: SarifCompareDeps): string =>
  path.join(deps.workspace().rootDir, sarifPaths.stamp);

/**
 * Whether the on-disk baselines were produced from the given merge-base
 * SHA (per the stamp file), making production skippable.
 */
export const hasCurrentBaseline = (sha: string, deps: SarifCompareDeps): boolean => {
  const stamp = baselineStampPath(deps);
  return deps.exists(stamp) && deps.readText(stamp).trim() === sha;
};

/**
 * Produces per-package baseline SARIF logs by linting the given
 * merge-base SHA in a throwaway git worktree and copying each
 * `dist/sarif/*.sarif` into the corresponding head package under
 * `dist/sarif/base/`, then stamps the SHA. A failing base lint is
 * tolerated: reporters write their SARIF logs before exiting, and a
 * baseline carrying findings is exactly what the ratchet diffs against.
 * Base commits that predate SARIF output simply produce no baseline,
 * and the compare skips those packages.
 */
/**
 * Ensures the commit's objects exist locally, fetching just that commit
 * on shallow clones (GitHub serves reachable SHAs directly).
 */
const ensureCommit = async (sha: string, deps: SarifCompareDeps): Promise<void> => {
  try {
    await deps.capture('git', ['cat-file', '-e', sha]);
  } catch {
    await deps.run('git', { args: ['fetch', '--depth=1', 'origin', sha] });
  }
};

export const produceBaseline = async (
  sha: string,
  deps: SarifCompareDeps,
): Promise<void> => {
  await ensureCommit(sha, deps);
  const baseDir = deps.makeTempDir();
  try {
    await deps.run('git', { args: ['worktree', 'add', '--detach', baseDir, sha] });
    await deps.run('pnpm', {
      args: ['install', '--frozen-lockfile', '--prefer-offline'],
      cwd: baseDir,
    });
    try {
      await deps.run('pnpm', {
        args: ['exec', 'turbo', 'run', 'lint', '--output-logs=errors-only'],
        cwd: baseDir,
      });
    } catch {
      // Pre-ratchet gtb fails lint on warnings after writing the SARIF log.
      deps.logger.error(`Base lint at ${sha} failed; using whatever SARIF it wrote`);
    }
    copyBaselineSarifs(baseDir, deps);
    deps.writeText(baselineStampPath(deps), `${sha}\n`);
  } finally {
    await deps.run('git', { args: ['worktree', 'remove', '--force', baseDir] });
  }
};

const copyBaselineSarifs = (baseDir: string, deps: SarifCompareDeps): void => {
  const base = deps.workspace(baseDir);
  const head = deps.workspace();
  /*
   * Clear baselines from any earlier production first: a package whose
   * new merge base wrote no SARIF must not keep a stale baseline from a
   * previous merge base.
   */
  const headDirs = new Set([head.rootDir, ...head.packageDirs]);
  for (const dir of headDirs) {
    deps.remove(path.join(dir, sarifPaths.base));
  }
  const baseDirs = new Set([base.rootDir, ...base.packageDirs]);
  for (const dir of baseDirs) {
    const relative = path.relative(base.rootDir, dir);
    const names = deps.list(path.join(dir, sarifPaths.dir));
    for (const name of names) {
      deps.copyFile(
        path.join(dir, sarifPaths.dir, name),
        path.join(head.rootDir, relative, sarifPaths.base, name),
      );
    }
  }
};

const matchFileForward = async (
  dir: string,
  name: string,
  deps: SarifCompareDeps,
): Promise<readonly NewFinding[]> => {
  const base = path.join(dir, sarifPaths.base, name);
  if (!deps.exists(base)) {
    /*
     * A missing baseline is an empty baseline, not a pass: every
     * finding is new and needs explicit acceptance. This keeps a newly
     * added reporter (or the bootstrap PR) from slipping findings in
     * silently.
     */
    deps.logger.error(`No baseline for ${name} in ${dir}; all findings are new`);
    const current = deps.readJson(path.join(dir, sarifPaths.dir, name));
    return extractAllFindings(parseSarifLog(current));
  }
  const matched = path.join(dir, sarifPaths.matched, name);
  // The multitool won't create the output file's parent directory.
  deps.ensureDir(path.join(dir, sarifPaths.matched));
  await deps.run(deps.resolveMultitool(), {
    args: [
      'match-results-forward', path.join(dir, sarifPaths.dir, name),
      '--previous', base,
      '--output-file-path', matched,
      // Reruns are routine (retries, local iteration); replace stale output.
      '--log', 'ForceOverwrite',
    ],
  });
  return extractNewFindings(parseSarifLog(deps.readJson(matched)));
};

/**
 * Snapshots the current SARIF logs as the baseline. On the default
 * branch the merge base of any future PR is HEAD itself, so those PRs'
 * baseline is just this commit's own reporter output: copy each
 * `dist/sarif/*.sarif` under `dist/sarif/base/` and stamp HEAD's SHA.
 * CI saves the result in a cache keyed on that SHA for PR compare runs
 * to restore.
 */
export const executeSarifBaseline = async (
  deps: SarifCompareDeps = defaultDeps,
): Promise<void> => {
  const sha = await deps.capture('git', ['rev-parse', 'HEAD']);
  const { rootDir } = deps.workspace();
  copyBaselineSarifs(rootDir, deps);
  deps.writeText(baselineStampPath(deps), `${sha}\n`);
  deps.logger.info(`Seeded SARIF baselines for ${sha}`);
};

/** Options for {@link executeSarifCompare}. */
export interface SarifCompareOptions {
  /**
   * Git ref to diff against. The baseline commit is the merge base of
   * this ref and HEAD (a `git merge-base` call, so it needs local
   * history — the local mode).
   */
  readonly baseRef?: string | undefined;
  /**
   * Exact baseline commit, no merge-base resolution. CI passes the PR
   * merge ref's first parent (`git rev-parse HEAD^1`): on the merged
   * checkout, the target branch head *is* the merge base, so this
   * needs no branch fetch or history. Mutually exclusive with
   * `baseRef`. When neither is set, `dist/sarif/base/` must already be
   * populated (e.g. restored from a cache or a prior run).
   */
  readonly baseSha?: string | undefined;
}

const resolveBaselineSha = async (
  options: SarifCompareOptions,
  deps: SarifCompareDeps,
): Promise<string | undefined> => {
  if (options.baseRef !== undefined && options.baseSha !== undefined) {
    throw new Error('--base and --base-sha are mutually exclusive');
  }
  if (options.baseSha !== undefined) {
    return options.baseSha;
  }
  if (options.baseRef !== undefined) {
    return deps.capture('git', ['merge-base', options.baseRef, 'HEAD']);
  }
  return undefined;
};

/**
 * Compares every SARIF log under each lint cwd's `dist/sarif/` against
 * its baseline via `sarif-multitool match-results-forward` and rejects
 * when any result is classified `new`. Matching is fingerprint and
 * content based, so baseline findings that merely moved (edits above
 * them) stay matched — only genuine regressions gate.
 */
export const executeSarifCompare = async (
  options: SarifCompareOptions = {},
  deps: SarifCompareDeps = defaultDeps,
): Promise<void> => {
  const sha = await resolveBaselineSha(options, deps);
  if (sha !== undefined) {
    if (hasCurrentBaseline(sha, deps)) {
      deps.logger.info(`Baselines for merge base ${sha} already present; reusing`);
    } else {
      await produceBaseline(sha, deps);
    }
  }
  const { packageDirs, rootDir } = deps.workspace();
  const lintDirs = [...new Set([rootDir, ...packageDirs])];
  const findings: NewFinding[] = [];

  for (const dir of lintDirs) {
    const names = deps.list(path.join(dir, sarifPaths.dir));
    for (const name of names) {
      findings.push(...await matchFileForward(dir, name, deps));
    }
  }

  if (findings.length > 0) {
    deps.logger.error(formatNewFindings(findings));
    throw new Error(
      `${String(findings.length)} new finding(s) not present in the baseline`,
    );
  }
  deps.logger.info('No new findings');
};
