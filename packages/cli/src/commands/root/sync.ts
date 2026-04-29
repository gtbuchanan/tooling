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

const writeCodecovConfig = (logger: Logger, discovery: WorkspaceDiscovery): void => {
  if (!discovery.packages.some(pkg => pkg.hasVitestTests)) {
    return;
  }
  const filePath = path.join(discovery.rootDir, 'codecov.yml');
  mergeCodecovSections(filePath, generateCodecovSections(discovery));
  logger.info(`wrote ${filePath}`);
};

/** Options for {@link runSync}. */
export interface RunSyncOptions {
  readonly cwd?: string;
  readonly force?: boolean;
  readonly logger?: Logger;
}

/**
 * Reconciles generated config with the current workspace state.
 *
 * Writes `turbo.json`, per-package tsconfigs, `package.json` scripts,
 * and `codecov.yml` from discovery. With `force: false` (default),
 * existing script values are preserved; with `force: true`, they're
 * overwritten.
 */
export const runSync = (options: RunSyncOptions = {}): void => {
  const cwd = options.cwd ?? process.cwd();
  const force = options.force ?? false;
  const logger = options.logger ?? createLogger();
  const discovery = discoverWorkspace({ cwd });

  writeSortedAndLog(
    logger, path.join(discovery.rootDir, 'turbo.json'), generateTurboJson(discovery),
  );

  for (const descriptor of planTsconfigs(discovery.rootDir, discovery.packages)) {
    const userOpts = readUserCompilerOptions(descriptor.path);
    writeSortedAndLog(logger, descriptor.path, descriptor.generate(userOpts));
  }

  for (const pkg of discovery.packages) {
    writePackageScripts(logger, pkg, discovery, force);
  }
  writeRootScripts(logger, discovery, force);
  writeCodecovConfig(logger, discovery);
};

/** Parsed citty args for {@link sync}. */
export interface SyncCommandArgs {
  readonly cwd?: string | undefined;
  readonly force?: boolean | undefined;
}

/**
 * Translates citty args into {@link RunSyncOptions} and invokes
 * {@link runSync}. Lives between the citty wrapper and the pure
 * function so the args translation is testable without going through
 * citty's `runCommand`.
 */
export const syncCommand = (args: SyncCommandArgs, logger: Logger): void => {
  runSync({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    force: args.force ?? false,
    logger,
  });
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
    description: 'Reconcile generated config with the current workspace',
    name: rootNames.sync,
  },
  run: ({ args }) => {
    syncCommand(args, createLogger());
  },
});
