import type { Leaf } from '#src/tasks/leaf.js';
import { type Toolchain, toolchainLeaves } from '#src/tasks/toolchain.js';
import { codecovToolchain } from '#src/toolchains/codecov/index.js';
import { eslintToolchain } from '#src/toolchains/eslint/index.js';
import { npmToolchain } from '#src/toolchains/npm/index.js';
import { pklToolchain } from '#src/toolchains/pkl/index.js';
import { skillsToolchain } from '#src/toolchains/skills/index.js';
import { typescriptToolchain } from '#src/toolchains/typescript/index.js';
import { vitestToolchain } from '#src/toolchains/vitest/index.js';

/**
 * Every toolchain contributing `gtb task` subcommands. Registering one here is
 * what gives its leaves a subcommand and a place in the generated config, so
 * neither can exist without the other.
 */
export const toolchains: readonly Toolchain[] = [
  codecovToolchain,
  eslintToolchain,
  npmToolchain,
  pklToolchain,
  skillsToolchain,
  typescriptToolchain,
  vitestToolchain,
];

/**
 * Every leaf task gtb generates a script and a turbo task for, in name order,
 * which is the order each aggregate lists its members in.
 */
export const leaves: readonly Leaf[] = toolchainLeaves(toolchains);
