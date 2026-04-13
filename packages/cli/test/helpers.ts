import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PackageCapabilities } from '#src/lib/discovery.js';
import { writeJsonFile } from '#src/lib/file-writer.js';
import { planTsconfigs } from '#src/lib/tsconfig-gen.js';

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
