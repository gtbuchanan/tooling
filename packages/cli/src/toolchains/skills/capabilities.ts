import type { Capability } from '#src/core/capability.js';

/**
 * Holds a `skills/` directory of authored Agent Skills, which
 * `compile:skills` and `deploy:skills` read.
 */
export const skills: Capability = {
  detect: ({ directories }) => directories.includes('skills'),
  name: 'skills',
};
