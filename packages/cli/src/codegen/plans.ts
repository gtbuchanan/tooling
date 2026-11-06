import { mkdirSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import type { Logger } from '#src/core/logger.js';
import {
  type Finding, type Toolchain, toolchainPlans,
} from '#src/tasks/toolchain.js';

type Write = Extract<Finding, { kind: 'write' }>;

/**
 * What `gtb verify` prints for each finding: every change a write would make,
 * prefixed with its path, and every problem as it stands.
 */
export const reportFindings = (findings: readonly Finding[]): readonly string[] =>
  findings.flatMap(finding => (finding.kind === 'write'
    ? finding.changes.map(change => `${finding.path}: ${change}`)
    : finding.message));

/**
 * Options for {@link syncPlans}.
 */
export interface SyncPlansOptions {
  /**
   * Discovers the workspace afresh, since a pass's writes can change what
   * the next pass discovers.
   */
  readonly discover: () => WorkspaceDiscovery;
  /**
   * What the first pass plans from, before anything has been written.
   */
  readonly discovery: WorkspaceDiscovery;
  readonly force: boolean;
  readonly logger: Logger;
}

/*
 * A pass only plans what earlier passes' writes made newly applicable, so
 * the chain is as long as the longest run of steps each enabling the next.
 * Hitting the limit means a plan keeps writing what it just wrote.
 */
const maxPasses = 5;

const applyWrite = (logger: Logger, { changes, content, path }: Write): void => {
  mkdirSync(nodePath.dirname(path), { recursive: true });
  writeFileSync(path, content);
  logger.info(`wrote ${path}`);
  for (const change of changes) {
    logger.info(`  ${change}`);
  }
};

/*
 * Two plans writing one file would each overwrite the other on every pass,
 * which would otherwise surface as a plan that never settles.
 */
const assertOneWriterPerFile = (writes: readonly Write[]): void => {
  const paths = writes.map(({ path }) => path);
  const shared = [...new Set(paths.filter((path, index) => paths.indexOf(path) !== index))];
  if (shared.length > 0) {
    throw new Error(`more than one plan writes ${shared.join(', ')}`);
  }
};

const syncPass = (
  toolchains: readonly Toolchain[],
  options: SyncPlansOptions,
  discovery: WorkspaceDiscovery,
  pass: number,
): void => {
  const writes = toolchainPlans(toolchains, {
    discovery,
    force: options.force,
    ignored: new Set(),
  }).filter(finding => finding.kind === 'write');
  if (writes.length === 0) {
    return;
  }
  if (pass > maxPasses) {
    const paths = writes.map(({ path }) => path).join(', ');
    throw new Error(
      `gtb sync did not settle after ${String(maxPasses)} passes: still writing ${paths}`,
    );
  }
  assertOneWriterPerFile(writes);
  for (const write of writes) {
    applyWrite(options.logger, write);
  }
  syncPass(toolchains, options, options.discover(), pass + 1);
};

/**
 * Applies every toolchain's writes, re-planning against fresh discovery until
 * a pass plans none.
 */
export const syncPlans = (
  toolchains: readonly Toolchain[],
  options: SyncPlansOptions,
): void => {
  syncPass(toolchains, options, options.discovery, 1);
};
