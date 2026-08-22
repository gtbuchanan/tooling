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
import { type ExecResult, execute } from '../../lib/process.ts';
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
 * Side-effecting git access, injected so the orchestration stays testable.
 */
export interface CatalogGateDeps {
  readonly execute: (command: string, args: readonly string[]) => Promise<ExecResult>;
}

const defaultDeps: CatalogGateDeps = { execute };

/**
 * Reads `pnpm-workspace.yaml` as of the base ref.
 *
 * A base that genuinely predates the file resolves to `''` (every catalog
 * entry then reads as newly added), but any *other* `git show` failure throws
 * rather than being folded into that same empty answer. Collapsing the two
 * would turn a transient git error into a report that every catalog entry in
 * the workspace just changed — the loudest possible false positive.
 */
export const readBaseWorkspace = async (
  base: string,
  deps: CatalogGateDeps,
): Promise<string> => {
  const resolved = await deps.execute('git', ['rev-parse', '--verify', base]);
  if (resolved.exitCode !== 0) {
    throw new Error(
      `cannot resolve base ref '${base}' — fetch it before running this check`,
    );
  }
  const target = `${base}:${workspaceFileName}`;
  const exists = await deps.execute('git', ['cat-file', '-e', target]);
  if (exists.exitCode !== 0) {
    return '';
  }
  const shown = await deps.execute('git', ['show', target]);
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
 * Reads the workspace and git state, then applies {@link checkCatalogGate}.
 */
export const runChangesetCheck = async (
  options: RunChangesetCheckOptions = {},
  deps: CatalogGateDeps = defaultDeps,
): Promise<readonly string[]> => {
  const discovery = discoverWorkspace(
    options.cwd === undefined ? undefined : { cwd: options.cwd },
  );
  const ignored = new Set([
    ...readConfiguredIgnores(discovery.rootDir),
    ...(options.ignored ?? []),
  ]);

  return checkCatalogGate({
    baseWorkspace: await readBaseWorkspace(options.base ?? defaultBaseRef, deps),
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
  const drift = await runChangesetCheck(
    {
      ...(args.since !== undefined && { base: args.since }),
      ...(args.cwd !== undefined && { cwd: args.cwd }),
      ignored: parseIgnoreArgs(rawArgs),
    },
    deps,
  );

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
