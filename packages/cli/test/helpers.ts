import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as v from 'valibot';
import { generateCodecovSections } from '#src/lib/codecov-config.js';
import { type PackageCapabilities, discoverWorkspace } from '#src/lib/discovery.js';
import {
  mergeCodecovSections, mergePackageScripts, writeJsonFile,
} from '#src/lib/file-writer.js';
import { ManifestSchema } from '#src/lib/manifest.js';
import { planTsconfigs } from '#src/lib/tsconfig-gen.js';
import {
  generatePackageScripts, generateRootScripts, generateTurboJson,
} from '#src/lib/turbo-config.js';

/** Creates an isolated temp directory for test fixtures. */
export const createTempDir = (): string =>
  mkdtempSync(join(tmpdir(), 'gtb-test-'));

/** Writes generated tsconfigs for a discovered workspace. */
export const writeTsconfigs = (
  rootDir: string,
  packages: readonly PackageCapabilities[],
): void => {
  for (const descriptor of planTsconfigs(rootDir, packages)) {
    writeJsonFile(descriptor.path, descriptor.generate());
  }
};

/** Writes a JSON file to a directory. */
export const writeJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(join(dir, name), JSON.stringify(data));
};

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(v.record(v.string(), v.unknown())),
});

/** Reads the tasks from a project's turbo.json. */
export const readTurboTasks = (root: string): Record<string, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(join(root, 'turbo.json'), 'utf-8'));
  const { tasks } = v.parse(TurboJsonSchema, raw);
  return tasks ?? {};
};

/** Reads the scripts from a package's package.json. */
export const readScripts = (pkgDir: string): Record<string, string> => {
  const raw: unknown = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
  const { scripts } = v.parse(ManifestSchema, raw);
  return scripts ?? {};
};

/** Initializes a fully valid project state (turbo.json, tsconfigs, scripts, codecov.yml). */
export const initProject = (root: string): void => {
  const discovery = discoverWorkspace({ cwd: root });
  writeJsonFile(join(root, 'turbo.json'), generateTurboJson(discovery));
  writeTsconfigs(root, discovery.packages);
  mergePackageScripts(join(root, 'package.json'), generateRootScripts(discovery), true);

  for (const pkg of discovery.packages) {
    const scripts = generatePackageScripts(pkg, discovery.isSelfHosted);
    const pkgPath = join(pkg.dir, 'package.json');
    const manifest = v.parse(ManifestSchema, JSON.parse(readFileSync(pkgPath, 'utf-8')));
    writeJson(pkg.dir, 'package.json', {
      ...manifest,
      scripts: { ...manifest.scripts, ...scripts },
    });
  }

  if (discovery.packages.some(pkg => pkg.hasVitestTests)) {
    mergeCodecovSections(
      join(root, 'codecov.yml'),
      generateCodecovSections(discovery),
    );
  }
};
