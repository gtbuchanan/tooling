import { join } from 'node:path';
import { generateCodecovSections } from '../lib/codecov-config.ts';
import {
  type PackageCapabilities, type WorkspaceDiscovery, discoverWorkspace,
} from '../lib/discovery.ts';
import {
  type MergeResult, mergeCodecovSections, mergePackageScripts, writeJsonFile,
} from '../lib/file-writer.ts';
import { planTsconfigs, readUserCompilerOptions } from '../lib/tsconfig-gen.ts';
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

const writeAndLog = (path: string, data: object): void => {
  writeJsonFile(path, data);
  console.log(`wrote ${path}`);
};

const writeRootScripts = (discovery: WorkspaceDiscovery, force: boolean): void => {
  const rootPkgPath = join(discovery.rootDir, 'package.json');
  logMergeResult('root', mergePackageScripts(rootPkgPath, generateRootScripts(discovery), force));
};

const writePackageScripts = (
  pkg: PackageCapabilities, force: boolean, isSelfHosted: boolean, rootDir: string,
): void => {
  const scripts = generatePackageScripts(pkg, isSelfHosted, rootDir);
  if (Object.keys(scripts).length === 0) {
    return;
  }
  logMergeResult(pkg.dir, mergePackageScripts(join(pkg.dir, 'package.json'), scripts, force));
};

const writeCodecovConfig = (discovery: WorkspaceDiscovery): void => {
  if (!discovery.packages.some(pkg => pkg.hasVitestTests)) {
    return;
  }
  const path = join(discovery.rootDir, 'codecov.yml');
  mergeCodecovSections(path, generateCodecovSections(discovery));
  console.log(`wrote ${path}`);
};

/** Generates turbo.json, tsconfigs, and per-package scripts from project discovery. */
export const turboInit = (args: readonly string[]): void => {
  const force = args.includes('--force');
  const discovery = discoverWorkspace();

  writeAndLog(join(discovery.rootDir, 'turbo.json'), generateTurboJson(discovery));

  for (const descriptor of planTsconfigs(discovery.rootDir, discovery.packages)) {
    const userOpts = readUserCompilerOptions(descriptor.path);
    writeAndLog(descriptor.path, descriptor.generate(userOpts));
  }

  for (const pkg of discovery.packages) {
    writePackageScripts(pkg, force, discovery.isSelfHosted, discovery.rootDir);
  }
  writeRootScripts(discovery, force);
  writeCodecovConfig(discovery);
};
