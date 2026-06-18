import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { generateCodecovSections } from '../../lib/codecov-config.ts';
import {
  type PackageCapabilities, type WorkspaceDiscovery, discoverWorkspace,
} from '../../lib/discovery.ts';
import {
  type MergeResult, mergeCodecovSections, mergePackageScripts, sortKeysDeep, writeJsonFile,
} from '../../lib/file-writer.ts';
import { type Logger, createLogger } from '../../lib/logger.ts';
import { generateManifests } from '../../lib/manifest-sync.ts';
import { generateMiseTasks, miseTasksFileName } from '../../lib/mise-tasks.ts';
import {
  type SyncScope, parseSyncScopes, syncScopes,
} from '../../lib/sync-scopes.ts';
import { planTsconfigs, readUserCompilerOptions } from '../../lib/tsconfig-gen.ts';
import {
  generatePackageScripts,
  generateRootScripts,
  generateTurboJson,
} from '../../lib/turbo-config.ts';
import { rootNames } from './names.ts';

const logMergeResult = (logger: Logger, label: string, result: MergeResult): void => {
  if (result.added.length > 0) {
    logger.info(`${label}: added ${result.added.join(', ')}`);
  }
  if (result.skipped.length > 0) {
    logger.info(`${label}: skipped ${result.skipped.join(', ')}`);
  }
};

const writeSortedAndLog = (logger: Logger, filePath: string, data: object): void => {
  writeJsonFile(filePath, sortKeysDeep(data));
  logger.info(`wrote ${filePath}`);
};

const writeRootScripts = (
  logger: Logger, discovery: WorkspaceDiscovery, force: boolean,
): void => {
  const rootPkgPath = path.join(discovery.rootDir, 'package.json');
  logMergeResult(
    logger,
    'root',
    mergePackageScripts(rootPkgPath, generateRootScripts(discovery), force),
  );
};

const writePackageScripts = (
  logger: Logger,
  pkg: PackageCapabilities,
  discovery: WorkspaceDiscovery,
  force: boolean,
): void => {
  const scripts = generatePackageScripts(pkg, discovery.isSelfHosted, discovery.rootDir);
  if (Object.keys(scripts).length === 0) {
    return;
  }
  logMergeResult(
    logger,
    pkg.dir,
    mergePackageScripts(path.join(pkg.dir, 'package.json'), scripts, force),
  );
};

/*
 * The hk task wiring is only useful in repos that pin tools with mise, so
 * gate generation on a mise.toml at the root. The `[task_config] includes`
 * line that loads this file stays a manual, one-time edit (verify checks
 * it) so sync never round-trips the hand-authored mise.toml.
 */
const writeMiseTasks = (logger: Logger, discovery: WorkspaceDiscovery): void => {
  if (!discovery.hasMise) {
    return;
  }
  const filePath = path.join(discovery.rootDir, miseTasksFileName);
  writeFileSync(filePath, generateMiseTasks(discovery));
  logger.info(`wrote ${filePath}`);
};

const writeManifests = (logger: Logger, discovery: WorkspaceDiscovery): void => {
  for (const { content, filePath } of generateManifests(discovery)) {
    writeFileSync(filePath, content);
    logger.info(`wrote ${filePath}`);
  }
};

const writeCodecovConfig = (logger: Logger, discovery: WorkspaceDiscovery): void => {
  if (discovery.packages.every(pkg => !pkg.hasVitestTests)) {
    return;
  }
  const filePath = path.join(discovery.rootDir, 'codecov.yml');
  mergeCodecovSections(filePath, generateCodecovSections(discovery));
  logger.info(`wrote ${filePath}`);
};

const writeTurboJson = (logger: Logger, discovery: WorkspaceDiscovery): void => {
  writeSortedAndLog(
    logger, path.join(discovery.rootDir, 'turbo.json'), generateTurboJson(discovery),
  );
};

const writeTsconfigFiles = (logger: Logger, discovery: WorkspaceDiscovery): void => {
  for (const descriptor of planTsconfigs(discovery.rootDir, discovery.packages)) {
    const userOpts = readUserCompilerOptions(descriptor.path);
    writeSortedAndLog(logger, descriptor.path, descriptor.generate(userOpts));
  }
};

const writeAllScripts = (
  logger: Logger, discovery: WorkspaceDiscovery, force: boolean,
): void => {
  for (const pkg of discovery.packages) {
    writePackageScripts(logger, pkg, discovery, force);
  }
  writeRootScripts(logger, discovery, force);
};

/** Options for {@link runSync}. */
export interface RunSyncOptions {
  readonly cwd?: string;
  readonly force?: boolean;
  readonly logger?: Logger;
  /** Artifacts to generate. Defaults to all {@link SYNC_SCOPES}. */
  readonly scopes?: ReadonlySet<SyncScope>;
}

/**
 * Reconciles generated config with the current workspace state.
 *
 * Writes the artifacts selected by `scopes` (default all): `turbo.json`,
 * per-package tsconfigs, `package.json` scripts, `mise.tasks.toml` (when
 * the root has a `mise.toml`), and `codecov.yml`. With `force: false`
 * (default), existing script values are preserved; with `force: true`,
 * they're overwritten.
 */
export const runSync = (options: RunSyncOptions = {}): void => {
  const cwd = options.cwd ?? process.cwd();
  const force = options.force ?? false;
  const logger = options.logger ?? createLogger();
  const scopes = options.scopes ?? new Set(syncScopes);
  const discovery = discoverWorkspace({ cwd });

  const writers: Record<SyncScope, () => void> = {
    codecov: () => { writeCodecovConfig(logger, discovery); },
    manifest: () => { writeManifests(logger, discovery); },
    mise: () => { writeMiseTasks(logger, discovery); },
    scripts: () => { writeAllScripts(logger, discovery, force); },
    tsconfig: () => { writeTsconfigFiles(logger, discovery); },
    turbo: () => { writeTurboJson(logger, discovery); },
  };

  for (const scope of syncScopes) {
    if (scopes.has(scope)) {
      writers[scope]();
    }
  }
};

/** Parsed citty args for {@link sync}. */
export interface SyncCommandArgs {
  readonly cwd?: string | undefined;
  readonly force?: boolean | undefined;
  /** Positional scope tokens (citty `args._`). Empty means all scopes. */
  readonly scopes?: readonly string[] | undefined;
}

/**
 * Translates citty args into {@link RunSyncOptions} and invokes
 * {@link runSync}. Lives between the citty wrapper and the pure
 * function so the args translation is testable without going through
 * citty's `runCommand`. Returns the exit code (1 on an unknown scope).
 */
export const syncCommand = (args: SyncCommandArgs, logger: Logger): number => {
  const parsed = parseSyncScopes(args.scopes ?? []);
  if ('errors' in parsed) {
    for (const message of parsed.errors) {
      logger.error(message);
    }

    return 1;
  }

  runSync({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    force: args.force ?? false,
    logger,
    scopes: parsed.scopes,
  });

  return 0;
};

/** Citty command wrapper for {@link syncCommand}. */
export const sync = defineCommand({
  args: {
    cwd: {
      alias: 'C',
      description: 'Workspace root directory (defaults to current working directory)',
      type: 'string',
    },
    force: {
      description: 'Overwrite existing package.json scripts',
      type: 'boolean',
    },
  },
  meta: {
    description:
      'Reconcile generated config with the current workspace ' +
      `(optionally scope to: ${syncScopes.join(', ')})`,
    name: rootNames.sync,
  },
  run: ({ args }) => {
    const exitCode = syncCommand(
      { cwd: args.cwd, force: args.force, scopes: args._ },
      createLogger(),
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  },
});
