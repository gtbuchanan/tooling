import type { Capability } from '#src/core/capability.js';

/**
 * Publishes to npm: not private, and names the directory its tarball is
 * packed from (`publishConfig.directory`).
 */
export const published: Capability = {
  detect: ({ manifest }) =>
    manifest.private !== true && manifest.publishConfig?.directory !== undefined,
  name: 'published',
};
