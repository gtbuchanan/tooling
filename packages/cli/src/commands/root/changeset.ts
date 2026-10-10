import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import * as v from 'valibot';
import {
  type CatalogConsumer,
  diffCatalogs,
  findUncoveredCatalogChanges,
  formatCatalogFinding,
  parseCatalogs,
  parseChangesetPackages,
} from '../../lib/catalog-gate.ts';
import { discoverWorkspace } from '../../lib/discovery.ts';
import { readJsonFile } from '../../lib/file-writer.ts';
import { type Logger, createLogger } from '../../lib/logger.ts';
import { type ExecResult, type RunOptions, execute, run } from '../../lib/process.ts';
import { StringArray } from '../../lib/schemas.ts';
import { rootNames } from './names.ts';
import { parseIgnoreArgs } from './verify.ts';

const workspaceFileName = 'pnpm-workspace.yaml';
const changesetDirName = '.changeset';
const defaultBaseRef = 'origin/main';

/**
 * Everything {@link checkCatalogGate} needs, already read from disk and git.
 */
export interface CheckCatalogGateInputs {
  /**
   * `pnpm-workspace.yaml` as of the base ref, or `''` when the base predates
   * the file.
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

const ChangesetConfigSchema = v.looseObject({
  ignore: v.optional(StringArray),
});

/**
 * Package names the changesets config already excludes from releases. They
 * can't be covered by a changeset, so the gate must not demand one.
 */
const readConfiguredIgnores = (rootDir: string): readonly string[] => {
  try {
    const raw = readJsonFile(path.join(rootDir, changesetDirName, 'config.json'));
    const result = v.safeParse(ChangesetConfigSchema, raw);

    return result.success ? result.output.ignore ?? [] : [];
  } catch {
    return [];
  }
};

const readChangesetSources = (rootDir: string): readonly string[] => {
  const dir = path.join(rootDir, changesetDirName);
  let entries: readonly string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries
    .filter(name => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .map(name => readFileSync(path.join(dir, name), 'utf8'));
};

const readHeadWorkspace = (rootDir: string): string => {
  try {
    return readFileSync(path.join(rootDir, workspaceFileName), 'utf8');
  } catch {
    return '';
  }
};

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
 * Reads `pnpm-workspace.yaml` as of the base ref.
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
   * `ls-tree` rather than `cat-file -e`, because only it separates the two
   * outcomes: an absent path is exit 0 with empty stdout, while a corrupt or
   * unreadable object is non-zero. `cat-file -e` collapses both into the same
   * non-zero, which would quietly reinstate the false positive below.
   * `--full-tree` keeps the pathspec root-relative, matching how `git show`
   * resolves `<rev>:<path>`.
   */
  const listed = await git([
    'ls-tree', '--full-tree', '--name-only', base, '--', workspaceFileName,
  ]);
  if (listed.exitCode !== 0) {
    throw new Error(`git ls-tree ${base} failed: ${listed.stderr}`);
  }
  if (listed.stdout === '') {
    return '';
  }
  const target = `${base}:${workspaceFileName}`;
  const shown = await git(['show', target]);
  if (shown.exitCode !== 0) {
    throw new Error(`git show ${target} failed: ${shown.stderr}`);
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
  const discovery = discoverWorkspace(
    options.cwd === undefined ? undefined : { cwd: options.cwd },
  );
  const base = options.base ?? defaultBaseRef;
  await runChangesetStatus(base, discovery.rootDir, deps);
  const ignored = new Set([
    ...readConfiguredIgnores(discovery.rootDir),
    ...(options.ignored ?? []),
  ]);

  return checkCatalogGate({
    baseWorkspace: await readBaseWorkspace(base, discovery.rootDir, deps),
    changesetSources: readChangesetSources(discovery.rootDir),
    headWorkspace: readHeadWorkspace(discovery.rootDir),
    ignored,
    packages: discovery.packages,
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
  logger.error(
    "add a changeset for the packages above, or 'pnpm changeset --empty' if " +
    'the new range genuinely needs no release',
  );

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
