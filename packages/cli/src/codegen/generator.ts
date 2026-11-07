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
 * reports its drift, one message per problem. Sync returns the problems it
 * can't fix, which fail it. A generator that only checks has no sync step.
 */
export interface Generator {
  readonly sync?: (context: SyncContext) => readonly string[];
  readonly verify: (context: VerifyContext) => readonly string[];
}

/**
 * Writes `data` as key-sorted JSON and logs the path.
 */
export const writeSortedAndLog = (logger: Logger, filePath: string, data: object): void => {
  writeJsonFile(filePath, sortKeysDeep(data));
  logger.info(`wrote ${filePath}`);
};
