import type { Toolchain } from '#src/tasks/toolchain.js';
import { packNpm } from '#src/toolchains/npm/commands/pack-npm.js';
import { packNpmLeaf } from '#src/toolchains/npm/leaves.js';

/**
 * The npm toolchain's `gtb task` subcommands.
 */
export const npmToolchain: Toolchain = {
  registrations: [
    { command: packNpm, leaf: packNpmLeaf },
  ],
};
