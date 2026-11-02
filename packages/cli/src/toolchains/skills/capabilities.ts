import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Capability } from '#src/core/capability.js';

/**
 * Holds a `skills/` directory of authored Agent Skills, which
 * `compile:skills` and `deploy:skills` read.
 */
export const skills: Capability = {
  detect: ({ dir }) => existsSync(path.join(dir, 'skills')),
  name: 'skills',
};
