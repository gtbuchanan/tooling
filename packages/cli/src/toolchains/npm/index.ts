import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/npm/capabilities.js';
import { checkPublishableDependencies } from '#src/toolchains/npm/checks.js';
import { packNpm } from '#src/toolchains/npm/commands/pack-npm.js';
import { packNpmLeaf } from '#src/toolchains/npm/leaves.js';

/**
 * The npm toolchain's `gtb task` subcommands, what discovery detects for it,
 * and what it checks of the workspace's manifests.
 */
export const npmToolchain: Toolchain = {
  checks: checkPublishableDependencies,
  detects: Object.values(capabilities),
  registrations: [
    { command: packNpm, leaf: packNpmLeaf },
  ],
};
