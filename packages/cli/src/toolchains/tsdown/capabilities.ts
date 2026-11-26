import type { Capability } from '#src/core/capability.js';

const configFile = /^tsdown\.config\.(?:[cm]?[jt]s|json)$/v;

/**
 * Holds a `tsdown.config.*`, which `compile:tsdown` bundles by.
 */
export const tsdownConfig: Capability = {
  detect: ({ files }) => files.some(file => configFile.test(file)),
  name: 'tsdownConfig',
};
