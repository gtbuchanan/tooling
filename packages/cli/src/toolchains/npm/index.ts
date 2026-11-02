import type { Toolchain } from '#src/tasks/toolchain.js';
import { checkPublishableDependencies } from '#src/toolchains/npm/checks.js';
import { packNpm } from '#src/toolchains/npm/commands/pack-npm.js';
import { packNpmLeaf } from '#src/toolchains/npm/leaves.js';

/**
 * The npm toolchain's `gtb task` subcommands, and what it checks of the
 * workspace's manifests.
 */
export const npmToolchain: Toolchain = {
  checks: checkPublishableDependencies,
  registrations: [
    { command: packNpm, leaf: packNpmLeaf },
  ],
};
