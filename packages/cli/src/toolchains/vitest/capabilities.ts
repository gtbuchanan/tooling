import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Capability, CapabilitySource } from '#src/core/capability.js';

const sharedConfig = '@gtbuchanan/vitest-config';

const isVitestUser = (
  { entries, manifest: { dependencies = {}, devDependencies = {} } }: CapabilitySource,
): boolean =>
  Object.hasOwn(dependencies, sharedConfig) ||
  Object.hasOwn(devDependencies, sharedConfig) ||
  entries.some(entry => entry.startsWith('vitest.config.'));

/**
 * Has unit tests for Vitest to run: uses Vitest, by depending on
 * `@gtbuchanan/vitest-config` or holding a `vitest.config.*`, and holds a
 * `test/` directory.
 */
export const vitestTests: Capability = {
  detect: source => isVitestUser(source) && existsSync(path.join(source.dir, 'test')),
  name: 'vitestTests',
};

/**
 * Holds a `vitest.config.e2e.*`, which is what `test:vitest:e2e` runs.
 */
export const vitestE2e: Capability = {
  detect: ({ entries }) => entries.some(entry => entry.startsWith('vitest.config.e2e.')),
  name: 'vitestE2e',
};
