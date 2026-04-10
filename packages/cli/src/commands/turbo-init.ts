import { join } from 'node:path';
import {
  type PackageCapabilities, type WorkspaceDiscovery, discoverWorkspace,
} from '../lib/discovery.ts';
import { type MergeResult, mergePackageScripts, writeJsonFile } from '../lib/file-writer.ts';
import {
  generatePackageScripts,
  generateRootScripts,
  generateTurboJson,
} from '../lib/turbo-config.ts';

const logMergeResult = (label: string, result: MergeResult): void => {
  if (result.added.length > 0) {
    console.log(`${label}: added ${result.added.join(', ')}`);
  }
  if (result.skipped.length > 0) {
    console.log(`${label}: skipped ${result.skipped.join(', ')}`);
  }
};

const writeTurboJson = (discovery: WorkspaceDiscovery): void => {
  const turboPath = join(discovery.rootDir, 'turbo.json');
  writeJsonFile(turboPath, generateTurboJson(discovery));
  console.log(`wrote ${turboPath}`);
};

const writeRootScripts = (discovery: WorkspaceDiscovery, force: boolean): void => {
  const rootPkgPath = join(discovery.rootDir, 'package.json');
  logMergeResult('root', mergePackageScripts(rootPkgPath, generateRootScripts(discovery), force));
};

const writePackageScripts = (
  pkg: PackageCapabilities, force: boolean, isSelfHosted: boolean,
): void => {
  const scripts = generatePackageScripts(pkg, isSelfHosted);
  if (Object.keys(scripts).length === 0) {
    return;
  }
  logMergeResult(pkg.dir, mergePackageScripts(join(pkg.dir, 'package.json'), scripts, force));
};

/** Generates turbo.json and per-package scripts from project discovery. */
export const turboInit = (args: readonly string[]): void => {
  const force = args.includes('--force');
  const discovery = discoverWorkspace();

  writeTurboJson(discovery);
  writeRootScripts(discovery, force);
  for (const pkg of discovery.packages) {
    writePackageScripts(pkg, force, discovery.isSelfHosted);
  }
};
