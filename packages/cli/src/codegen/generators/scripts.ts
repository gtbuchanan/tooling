import path from 'node:path';
import type { Generator } from '#src/codegen/generator.js';
import {
  forbiddenRootScripts,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from '#src/codegen/turbo-config.js';
import {
  type PackageCapabilities, type WorkspaceDiscovery, vendoredCli,
} from '#src/core/discovery.js';
import { type MergeResult, mergePackageScripts } from '#src/core/file-writer.js';
import type { Logger } from '#src/core/logger.js';
import { readParsedManifest } from '#src/core/workspace.js';

const logMergeResult = (logger: Logger, label: string, result: MergeResult): void => {
  if (result.added.length > 0) {
    logger.info(`${label}: added ${result.added.join(', ')}`);
  }
  if (result.skipped.length > 0) {
    logger.info(`${label}: skipped ${result.skipped.join(', ')}`);
  }
};

const writeRootScripts = (
  logger: Logger, discovery: WorkspaceDiscovery, shouldForce: boolean,
): void => {
  const rootPkgPath = path.join(discovery.rootDir, 'package.json');
  logMergeResult(
    logger,
    'root',
    mergePackageScripts(rootPkgPath, generateRootScripts(discovery), shouldForce),
  );
};

const writePackageScripts = (
  logger: Logger,
  pkg: PackageCapabilities,
  discovery: WorkspaceDiscovery,
  shouldForce: boolean,
): void => {
  const scripts = generatePackageScripts(
    pkg, discovery.isSelfHosted, vendoredCli(discovery)?.dir,
  );
  if (Object.keys(scripts).length === 0) {
    return;
  }
  logMergeResult(
    logger,
    pkg.dir,
    mergePackageScripts(path.join(pkg.dir, 'package.json'), scripts, shouldForce),
  );
};

const tryReadScripts = (dir: string): Record<string, string> | undefined => {
  try {
    return readParsedManifest(dir).scripts;
  } catch {
    return undefined;
  }
};

const checkScripts = (
  dir: string,
  expected: Record<string, string>,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const scripts = tryReadScripts(dir);

  return Object.keys(expected)
    .filter(name => !ignored.has(name))
    .filter(name => scripts === undefined || !Object.hasOwn(scripts, name))
    .map(name => `${dir}: missing script '${name}'`);
};

/**
 * Flags root scripts that shadow a turbo aggregate. Only single-package repos
 * can hit this — see `forbiddenRootScripts`. Unlike every other check here the
 * drift is a script's *presence*, so the fix is deletion, not `gtb sync`.
 */
const checkShadowedAggregates = (
  discovery: WorkspaceDiscovery,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const scripts = tryReadScripts(discovery.rootDir);

  return forbiddenRootScripts(discovery)
    .filter(name => !ignored.has(name))
    .filter(name => scripts !== undefined && Object.hasOwn(scripts, name))
    .map(name =>
      `${discovery.rootDir}: script '${name}' shadows the turbo task of the ` +
      `same name — delete it and run 'gtb turbo run ${name}' instead`);
};

/**
 * The `package.json` scripts every package and the root run their tasks
 * through.
 */
export const scriptsGenerator: Generator = {
  sync: ({ discovery, force, logger }) => {
    for (const pkg of discovery.packages) {
      writePackageScripts(logger, pkg, discovery, force);
    }
    writeRootScripts(logger, discovery, force);
  },
  verify: ({ discovery, ignored }) => [
    ...checkScripts(discovery.rootDir, generateRequiredRootScripts(discovery), ignored),
    ...checkShadowedAggregates(discovery, ignored),
    ...discovery.packages.flatMap(pkg => checkScripts(
      pkg.dir,
      generatePackageScripts(pkg, discovery.isSelfHosted, vendoredCli(discovery)?.dir),
      ignored,
    )),
  ],
};
