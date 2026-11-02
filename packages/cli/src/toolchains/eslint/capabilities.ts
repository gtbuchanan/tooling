import type { Capability } from '#src/core/capability.js';

const sharedConfig = '@gtbuchanan/eslint-config';

/**
 * Uses ESLint: depends on `@gtbuchanan/eslint-config`, or holds an
 * `eslint.config.*` of its own, which is what `lint:eslint` reads.
 */
export const eslint: Capability = {
  detect: ({ entries, manifest: { dependencies = {}, devDependencies = {} } }) =>
    Object.hasOwn(dependencies, sharedConfig) ||
    Object.hasOwn(devDependencies, sharedConfig) ||
    entries.some(entry => entry.startsWith('eslint.config.')),
  name: 'eslint',
};
