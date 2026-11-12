import type { Capability } from '#src/core/capability.js';

const sharedConfig = '@gtbuchanan/eslint-config';

/**
 * Uses ESLint: depends on `@gtbuchanan/eslint-config`, or holds an
 * `eslint.config.*` of its own, which is what `lint:eslint` reads.
 */
export const eslint: Capability = {
  detect: ({ files, manifest: { dependencies = {}, devDependencies = {} } }) =>
    Object.hasOwn(dependencies, sharedConfig) ||
    Object.hasOwn(devDependencies, sharedConfig) ||
    files.some(file => file.startsWith('eslint.config.')),
  name: 'eslint',
};
