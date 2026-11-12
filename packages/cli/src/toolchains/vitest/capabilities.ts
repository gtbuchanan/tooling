import type { Capability, CapabilitySource } from '#src/core/capability.js';

const sharedConfig = '@gtbuchanan/vitest-config';

const isVitestUser = (
  { files, manifest: { dependencies = {}, devDependencies = {} } }: CapabilitySource,
): boolean =>
  Object.hasOwn(dependencies, sharedConfig) ||
  Object.hasOwn(devDependencies, sharedConfig) ||
  files.some(file => file.startsWith('vitest.config.'));

/**
 * Has unit tests for Vitest to run: uses Vitest, by depending on
 * `@gtbuchanan/vitest-config` or holding a `vitest.config.*`, and holds a
 * `test/` directory.
 */
export const vitestTests: Capability = {
  detect: source => isVitestUser(source) && source.directories.includes('test'),
  name: 'vitestTests',
};

/**
 * Holds a `vitest.config.e2e.*`, which is what `test:vitest:e2e` runs.
 */
export const vitestE2e: Capability = {
  detect: ({ files }) => files.some(file => file.startsWith('vitest.config.e2e.')),
  name: 'vitestE2e',
};
