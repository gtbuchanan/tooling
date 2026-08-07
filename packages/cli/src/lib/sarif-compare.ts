import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { styleText } from 'node:util';
import * as v from 'valibot';
import { readJsonFile } from './file-writer.ts';
import { type StyleText, formatFindingReport } from './finding-report.ts';
import { type Logger, createLogger } from './logger.ts';
import { type RunOptions, capture, run } from './process.ts';
import {
  type NewFinding, extractAllFindings, extractNewFindings, parseSarifLog,
} from './sarif-log.ts';
import { sarifPaths } from './sarif-paths.ts';
import { localeComparer } from './sort.ts';
import { planTurboInvocation } from './turbo-invocation.ts';
import { type WorkspaceContext, resolveWorkspace } from './workspace.ts';

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
  /** Styles the new-findings report (identity in tests). */
  readonly style: StyleText;
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

/**
 * Real I/O implementations backing {@link SarifCompareDeps}. Exported
 * for direct unit coverage; the commands use them via default params.
 * @internal
 */
export const defaultSarifDeps: SarifCompareDeps = {
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
  // The report goes to stderr; let styleText gate color on that stream.
  style: (format, text) => styleText(format, text, { stream: process.stderr }),
  workspace: cwd => resolveWorkspace(cwd === undefined ? undefined : { cwd }),
  writeText: (filePath, content) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  },
};

/**
 * Unique lint cwds of a workspace. The root is itself a lint cwd and,
 * in a single-package repo, coincides with the sole package dir.
 */
const lintDirs = (workspace: WorkspaceContext): readonly string[] =>
  [...new Set([workspace.rootDir, ...workspace.packageDirs])];

/** Absolute path of the baseline stamp file for a workspace root. */
const baselineStampPath = (rootDir: string): string =>
  path.join(rootDir, sarifPaths.stamp);

/**
 * Whether the on-disk baselines were produced from the given merge-base
 * SHA (per the stamp file), making production skippable.
 */
const hasCurrentBaseline = (
  sha: string,
  rootDir: string,
  deps: SarifCompareDeps,
): boolean => {
  const stamp = baselineStampPath(rootDir);
  return deps.exists(stamp) && deps.readText(stamp).trim() === sha;
};

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
export const produceBaseline = async (
  sha: string,
  head: WorkspaceContext,
  deps: SarifCompareDeps,
): Promise<void> => {
  await ensureCommit(sha, deps);
  const baseDir = deps.makeTempDir();
  try {
    await deps.run('git', { args: ['worktree', 'add', '--detach', baseDir, sha] });
    /*
     * The bootstrap assumes the lint graph needs only the node
     * toolchain: pnpm install plus whatever the ambient PATH provides.
     * The temp worktree lives outside the repo, so per-directory tool
     * managers (mise) never activate there — a base commit pinning
     * different tool versions resolves the head environment's binaries
     * instead. Fine while every SARIF reporter is node-based; revisit
     * with a bootstrap seam when a non-node reporter joins the graph.
     */
    await deps.run('pnpm', {
      args: ['install', '--frozen-lockfile', '--prefer-offline'],
      cwd: baseDir,
    });
    /*
     * The planner keeps the Android (Termux) escape hatch working here
     * too: its PATH plan (`bin: 'turbo'`) is delegated to the
     * worktree's own pnpm so the base's pinned turbo runs, while on
     * Android the resolved Termux binary is spawned directly — the
     * node_modules launcher rejects `android` upfront.
     */
    const lintArgs = ['run', 'lint', '--output-logs=errors-only'];
    const plan = planTurboInvocation({
      platform: process.platform,
      rawArgs: lintArgs,
    });
    if (plan.kind === 'error') throw new Error(plan.message);
    try {
      await (plan.bin === 'turbo'
        ? deps.run('pnpm', { args: ['exec', 'turbo', ...lintArgs], cwd: baseDir })
        : deps.run(plan.bin, { args: plan.args, cwd: baseDir }));
    } catch {
      // Pre-ratchet gtb fails lint on warnings after writing the SARIF log.
      deps.logger.error(`Base lint at ${sha} failed; using whatever SARIF it wrote`);
    }
    copyBaselineSarifs(deps.workspace(baseDir), head, deps);
    deps.writeText(baselineStampPath(head.rootDir), `${sha}\n`);
  } finally {
    await deps.run('git', { args: ['worktree', 'remove', '--force', baseDir] });
  }
};

const copyBaselineSarifs = (
  base: WorkspaceContext,
  head: WorkspaceContext,
  deps: SarifCompareDeps,
): void => {
  /*
   * Clear baselines from any earlier production first: a package whose
   * new merge base wrote no SARIF must not keep a stale baseline from a
   * previous merge base.
   */
  for (const dir of lintDirs(head)) {
    deps.remove(path.join(dir, sarifPaths.base));
  }
  for (const dir of lintDirs(base)) {
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
  deps: SarifCompareDeps = defaultSarifDeps,
): Promise<void> => {
  const sha = await deps.capture('git', ['rev-parse', 'HEAD']);
  const head = deps.workspace();
  copyBaselineSarifs(head, head, deps);
  deps.writeText(baselineStampPath(head.rootDir), `${sha}\n`);
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
  deps: SarifCompareDeps = defaultSarifDeps,
): Promise<void> => {
  const head = deps.workspace();
  const sha = await resolveBaselineSha(options, deps);
  if (sha !== undefined) {
    if (hasCurrentBaseline(sha, head.rootDir, deps)) {
      deps.logger.info(`Baselines for merge base ${sha} already present; reusing`);
    } else {
      await produceBaseline(sha, head, deps);
    }
  }
  /*
   * Each pairing writes to its own `matched/<name>`, so the multitool
   * spawns are independent — run them concurrently. Gathering in pair
   * order keeps the report deterministic.
   */
  const pairs = lintDirs(head).flatMap(dir =>
    deps.list(path.join(dir, sarifPaths.dir)).map(name => ({ dir, name })));
  const matchedFindings = await Promise.all(
    pairs.map(pair => matchFileForward(pair.dir, pair.name, deps)),
  );
  const findings = matchedFindings.flat();

  if (findings.length > 0) {
    deps.logger.error(formatFindingReport(findings, deps.style));
    throw new Error(
      `${String(findings.length)} new finding(s) not present in the baseline`,
    );
  }
  deps.logger.info('No new findings');
};
