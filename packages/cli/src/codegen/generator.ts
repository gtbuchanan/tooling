import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import { sortKeysDeep, writeJsonFile } from '#src/core/file-writer.js';
import type { Logger } from '#src/core/logger.js';

/**
 * What a generator's sync step may read.
 */
export interface SyncContext {
  readonly discovery: WorkspaceDiscovery;
  /**
   * Overwrite existing `package.json` scripts rather than preserve them.
   */
  readonly force: boolean;
  readonly logger: Logger;
}

/**
 * What a generator's verify step may read.
 */
export interface VerifyContext {
  readonly discovery: WorkspaceDiscovery;
  /**
   * Task and script names `--ignore` exempts from drift detection.
   */
  readonly ignored: ReadonlySet<string>;
}

/**
 * One generated artifact: how `gtb sync` writes it and how `gtb verify`
 * reports its drift, one message per problem. A generator that only checks
 * has no sync step.
 */
export interface Generator {
  readonly sync?: (context: SyncContext) => void;
  readonly verify: (context: VerifyContext) => readonly string[];
}

/**
 * Whether gtb drives the workspace's build, which only a root depending on
 * `@gtbuchanan/cli` does (a self-hosted root included). An hk-only adopter
 * runs gtb from mise for its hooks and owns whatever build config it has, so
 * the steps that generate turbo, scripts and tsconfigs leave it alone.
 */
export const isGtbBuild = ({ dependsOnCli }: WorkspaceDiscovery): boolean => dependsOnCli;

/**
 * Writes `data` as key-sorted JSON and logs the path.
 */
export const writeSortedAndLog = (logger: Logger, filePath: string, data: object): void => {
  writeJsonFile(filePath, sortKeysDeep(data));
  logger.info(`wrote ${filePath}`);
};
