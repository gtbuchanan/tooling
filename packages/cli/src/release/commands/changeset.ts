import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readConfig } from '@changesets/config';
import { defineCommand } from 'citty';
import { parseIgnoreArgs } from '#src/codegen/commands/verify.js';
import { rootNames } from '#src/core/command-names.js';
import { type WorkspacePackage, discoverWorkspace } from '#src/core/discovery.js';
import { type Logger, createLogger } from '#src/core/logger.js';
import { type ExecResult, type RunOptions, execute, run } from '#src/core/process.js';
import {
  type CatalogConsumer,
  diffCatalogs,
  findUncoveredCatalogChanges,
  formatCatalogFinding,
  parseCatalogs,
  parseChangesetPackages,
} from '#src/release/catalog-gate.js';
import { capabilities } from '#src/toolchains/index.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { catalogDependenciesOf } from '#src/toolchains/npm/manifest.js';

const workspaceFileName = 'pnpm-workspace.yaml';
const changesetDirName = '.changeset';
const defaultBaseRef = 'origin/main';
const noMergeBaseExitCode = 1;

const toCatalogConsumer = (pkg: WorkspacePackage): CatalogConsumer => ({
  catalogDependencies: catalogDependenciesOf(pkg),
  isPublished: pkg.capabilities.has(published),
  name: pkg.name,
});

/**
 * Everything {@link checkCatalogGate} needs, already read from disk and git.
 */
export interface CheckCatalogGateInputs {
  /**
   * `pnpm-workspace.yaml` as of HEAD's merge base with the base ref, or `''`
   * when that commit predates the file.
   */
  readonly baseWorkspace: string;
  /**
   * Raw contents of every pending changeset.
   */
  readonly changesetSources: readonly string[];
  readonly headWorkspace: string;
  readonly ignored: ReadonlySet<string>;
  readonly packages: readonly CatalogConsumer[];
}

/**
 * The pure core of the gate: reports one drift line per published package that
 * a catalog change reaches with no changeset releasing it. An empty result
 * means no drift.
 */
export const checkCatalogGate = (
  inputs: CheckCatalogGateInputs,
): readonly string[] => {
  const changes = diffCatalogs(
    parseCatalogs(inputs.baseWorkspace),
    parseCatalogs(inputs.headWorkspace),
  );
  if (changes.length === 0) {
    return [];
  }
  const covered = new Set(inputs.changesetSources.flatMap(parseChangesetPackages));

  return findUncoveredCatalogChanges({
    changes,
    covered,
    ignored: inputs.ignored,
    packages: inputs.packages,
  }).map(formatCatalogFinding);
};

/*
 * Only an absent path earns a reader's empty default. Any other failure hides
 * real state: an unreadable workspace file reads as an empty catalog and
 * passes, and an unreadable `.changeset` drops the changesets covering a bump.
 */
const isNotFound = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const orWhenAbsent = <T>(read: () => T, absent: T): T => {
  try {
    return read();
  } catch (error) {
    if (isNotFound(error)) {
      return absent;
    }
    throw error;
  }
};

/**
 * Package names the changesets config already excludes from releases. They
 * can't be covered by a changeset, so the gate must not demand one.
 *
 * Read through changesets' own config loader, because it resolves `ignore`
 * entries as ordered globs (negation included) against the workspace's
 * package names. A copy of that matching would drift from the releases it has
 * to agree with.
 */
const readConfiguredIgnores = async (rootDir: string): Promise<readonly string[]> => {
  let result: Awaited<ReturnType<typeof readConfig>>;
  try {
    result = await readConfig(rootDir);
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
  if (result.errors !== undefined) {
    throw new Error(`invalid changesets config: ${result.errors.join('; ')}`);
  }

  return result.config.ignore;
};

const readChangesetSources = (rootDir: string): readonly string[] => {
  const dir = path.join(rootDir, changesetDirName);

  return orWhenAbsent<readonly string[]>(() => readdirSync(dir), [])
    .filter(name => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .map(name => readFileSync(path.join(dir, name), 'utf8'));
};

const readHeadWorkspace = (rootDir: string): string =>
  orWhenAbsent(() => readFileSync(path.join(rootDir, workspaceFileName), 'utf8'), '');

/**
 * Side-effecting git and changesets access, injected so the orchestration
 * stays testable.
 */
export interface CatalogGateDeps {
  readonly execute: (command: string, args: readonly string[]) => Promise<ExecResult>;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
}

const defaultDeps: CatalogGateDeps = { execute, run };

/**
 * Reads `pnpm-workspace.yaml` as of HEAD's merge base with the base ref.
 *
 * A base that genuinely predates the file resolves to `''` (every catalog
 * entry then reads as newly added), but any *other* git failure throws rather
 * than being folded into that same empty answer. Collapsing the two would turn
 * a transient git error into a report that every catalog entry in the
 * workspace just changed — the loudest possible false positive.
 */
export const readBaseWorkspace = async (
  base: string,
  cwd: string,
  deps: CatalogGateDeps,
): Promise<string> => {
  /*
   * `-C` is what keeps the base revision and the head worktree in the same
   * repository. `execute` spawns without a `cwd`, so without this every git
   * call would read the process working directory while the rest of the gate
   * reads the discovered root — and a `--cwd` pointed elsewhere would diff two
   * unrelated workspaces, reporting every catalog entry as newly added.
   */
  const git = (args: readonly string[]): Promise<ExecResult> =>
    deps.execute('git', ['-C', cwd, ...args]);
  const resolved = await git(['rev-parse', '--verify', base]);
  if (resolved.exitCode !== 0) {
    throw new Error(
      `cannot resolve base ref '${base}' — fetch it before running this check`,
    );
  }
  /*
   * Read the base where this branch forked from it, not at its tip:
   * `changeset status` diffs from `git merge-base <base> HEAD`, and the two
   * halves of the check must measure the same change. At the tip, anything
   * that landed on the base after the fork reads as this branch undoing it.
   */
  const merged = await git(['merge-base', base, 'HEAD']);
  /*
   * Exit 1 is git's "no common ancestor", which a shallow clone produces.
   * Anything else (an unborn HEAD, a missing object) is a different failure,
   * and advice to fetch history would hide git's own diagnosis of it.
   */
  if (merged.exitCode === noMergeBaseExitCode) {
    throw new Error(
      `no merge base between '${base}' and HEAD — fetch enough history to connect them`,
    );
  }
  if (merged.exitCode !== 0) {
    throw new Error(`git merge-base ${base} HEAD failed: ${merged.stderr}`);
  }
  const forkPoint = merged.stdout;
  // Names the ref the caller passed as well as the commit actually read.
  const described = `${base} (${forkPoint})`;
  /*
   * `ls-tree` rather than `cat-file -e`, because only it separates the two
   * outcomes: an absent path is exit 0 with empty stdout, while a corrupt or
   * unreadable object is non-zero. `cat-file -e` collapses both into the same
   * non-zero, which would quietly reinstate the false positive below.
   *
   * Both lookups resolve the path from `cwd`, the workspace root, which is
   * where the head side reads the file. That root can sit below the git top
   * level, so a top-level path would read a different file, or none.
   * `ls-tree` pathspecs are cwd-relative by default, and `<rev>:./<path>` is
   * the cwd-relative form for `git show`.
   */
  const listed = await git(['ls-tree', '--name-only', forkPoint, '--', workspaceFileName]);
  if (listed.exitCode !== 0) {
    throw new Error(`git ls-tree ${described} failed: ${listed.stderr}`);
  }
  if (listed.stdout === '') {
    return '';
  }
  const shown = await git(['show', `${forkPoint}:./${workspaceFileName}`]);
  if (shown.exitCode !== 0) {
    throw new Error(`git show ${described}:./${workspaceFileName} failed: ${shown.stderr}`);
  }

  return shown.stdout;
};

/**
 * Options for {@link runChangesetCheck}.
 */
export interface RunChangesetCheckOptions {
  readonly base?: string;
  readonly cwd?: string;
  readonly ignored?: ReadonlySet<string>;
}

/**
 * Runs `changeset status`, which fails when a versionable package changed and
 * no changeset exists at all. Delegated to changesets rather than
 * reimplemented, and run with inherited stdio so its own diagnostics reach the
 * user verbatim.
 *
 * This runs first because its failure subsumes the catalog gate's: with no
 * changesets present, every catalog finding would be uncovered too, so
 * reporting both is redundant noise.
 */
const runChangesetStatus = async (
  base: string,
  cwd: string,
  deps: CatalogGateDeps,
): Promise<void> => {
  try {
    await deps.run('pnpm', {
      args: ['exec', 'changeset', 'status', `--since=${base}`],
      cwd,
    });
  } catch {
    /*
     * Deliberately not "changeset status failed": `pnpm exec` verifies the
     * workspace's dependencies first, so this also fires when that step fails
     * and changesets never ran.
     */
    throw new Error('changeset status did not pass — see the output above');
  }
};

/**
 * Reads the workspace and git state, then applies both gates: `changeset
 * status` for the stock "a changeset exists" requirement, then
 * {@link checkCatalogGate} for the catalog changes it cannot see. Both resolve
 * the same base ref, which is why they share one command.
 */
export const runChangesetCheck = async (
  options: RunChangesetCheckOptions = {},
  deps: CatalogGateDeps = defaultDeps,
): Promise<readonly string[]> => {
  const discovery = discoverWorkspace({ capabilities, cwd: options.cwd ?? process.cwd() });
  const base = options.base ?? defaultBaseRef;
  await runChangesetStatus(base, discovery.rootDir, deps);
  const ignored = new Set([
    ...await readConfiguredIgnores(discovery.rootDir),
    ...(options.ignored ?? []),
  ]);

  return checkCatalogGate({
    baseWorkspace: await readBaseWorkspace(base, discovery.rootDir, deps),
    changesetSources: readChangesetSources(discovery.rootDir),
    headWorkspace: readHeadWorkspace(discovery.rootDir),
    ignored,
    packages: discovery.packages.map(toCatalogConsumer),
  });
};

/**
 * Parsed citty args for the `check` subcommand.
 */
export interface ChangesetCheckCommandArgs {
  readonly cwd?: string | undefined;
  readonly since?: string | undefined;
}

/**
 * Runs the gate and reports drift through the given logger. Returns the exit
 * code so the citty wrapper can set `process.exitCode` and tests can assert
 * without mutating process state.
 */
export const changesetCheckCommand = async (
  rawArgs: readonly string[],
  args: ChangesetCheckCommandArgs,
  logger: Logger,
  deps: CatalogGateDeps = defaultDeps,
): Promise<number> => {
  let drift: readonly string[];
  try {
    drift = await runChangesetCheck(
      {
        ...(args.since !== undefined && { base: args.since }),
        ...(args.cwd !== undefined && { cwd: args.cwd }),
        ignored: parseIgnoreArgs(rawArgs),
      },
      deps,
    );
  } catch (error) {
    /*
     * A hard failure (missing changeset, unresolvable base, unreadable git
     * object) is the gate's answer, not a crash — report it as a non-zero exit
     * rather than an unhandled rejection.
     */
    logger.error(error instanceof Error ? error.message : String(error));

    return 1;
  }

  if (drift.length === 0) {
    logger.info('changeset check passed — no uncovered catalog changes');

    return 0;
  }

  for (const message of drift) {
    logger.error(message);
  }
  logger.error('add a changeset that releases the packages above');

  return 1;
};

const check = defineCommand({
  args: {
    cwd: {
      alias: 'C',
      description: 'Workspace root directory (defaults to current working directory)',
      type: 'string',
    },
    ignore: {
      description: 'Skip a specific package',
      type: 'string',
    },
    since: {
      description: `Base ref to diff the catalog against (defaults to ${defaultBaseRef})`,
      type: 'string',
    },
  },
  meta: {
    description: 'Require a changeset for catalog changes that reach published packages',
    name: 'check',
  },
  run: async ({ rawArgs, args }) => {
    const exitCode = await changesetCheckCommand(
      rawArgs,
      { cwd: args.cwd, since: args.since },
      createLogger(),
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  },
});

/**
 * `gtb changeset` — changeset gates that `changeset status` cannot express.
 */
export const changeset = defineCommand({
  meta: {
    description: 'Changeset coverage checks',
    name: rootNames.changeset,
  },
  subCommands: { check },
});
