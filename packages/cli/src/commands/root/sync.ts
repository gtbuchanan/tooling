import path from 'node:path';
import { defineCommand } from 'citty';
import { generateCodecovSections } from '../../lib/codecov-config.ts';
import {
  type PackageCapabilities, type WorkspaceDiscovery, discoverWorkspace,
} from '../../lib/discovery.ts';
import {
  type MergeResult, mergeCodecovSections, mergePackageScripts, sortKeysDeep, writeJsonFile,
} from '../../lib/file-writer.ts';
import { planTsconfigs, readUserCompilerOptions } from '../../lib/tsconfig-gen.ts';
import {
  generatePackageScripts,
  generateRootScripts,
  generateTurboJson,
} from '../../lib/turbo-config.ts';
import { rootNames } from './names.ts';

const logMergeResult = (label: string, result: MergeResult): void => {
  if (result.added.length > 0) {
    console.log(`${label}: added ${result.added.join(', ')}`);
  }
  if (result.skipped.length > 0) {
    console.log(`${label}: skipped ${result.skipped.join(', ')}`);
  }
};

const writeSortedAndLog = (filePath: string, data: object): void => {
  writeJsonFile(filePath, sortKeysDeep(data));
  console.log(`wrote ${filePath}`);
};

const writeRootScripts = (discovery: WorkspaceDiscovery, force: boolean): void => {
  const rootPkgPath = path.join(discovery.rootDir, 'package.json');
  logMergeResult('root', mergePackageScripts(rootPkgPath, generateRootScripts(discovery), force));
};

const writePackageScripts = (
  pkg: PackageCapabilities, force: boolean, isSelfHosted: boolean, rootDir: string,
): void => {
  const scripts = generatePackageScripts(pkg, isSelfHosted, rootDir);
  if (Object.keys(scripts).length === 0) {
    return;
  }
  logMergeResult(pkg.dir, mergePackageScripts(path.join(pkg.dir, 'package.json'), scripts, force));
};

const writeCodecovConfig = (discovery: WorkspaceDiscovery): void => {
  if (!discovery.packages.some(pkg => pkg.hasVitestTests)) {
    return;
  }
  const filePath = path.join(discovery.rootDir, 'codecov.yml');
  mergeCodecovSections(filePath, generateCodecovSections(discovery));
  console.log(`wrote ${filePath}`);
};

/**
 * Reconciles generated config with the current workspace state.
 *
 * Writes `turbo.json`, per-package tsconfigs, `package.json` scripts,
 * and `codecov.yml` from discovery. Without `--force`, existing script
 * values are preserved; pass `--force` to overwrite them.
 */
export const sync = defineCommand({
  args: {
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
    const force = args.force === true;
    const discovery = discoverWorkspace();

    writeSortedAndLog(path.join(discovery.rootDir, 'turbo.json'), generateTurboJson(discovery));

    for (const descriptor of planTsconfigs(discovery.rootDir, discovery.packages)) {
      const userOpts = readUserCompilerOptions(descriptor.path);
      writeSortedAndLog(descriptor.path, descriptor.generate(userOpts));
    }

    for (const pkg of discovery.packages) {
      writePackageScripts(pkg, force, discovery.isSelfHosted, discovery.rootDir);
    }
    writeRootScripts(discovery, force);
    writeCodecovConfig(discovery);
  },
});
