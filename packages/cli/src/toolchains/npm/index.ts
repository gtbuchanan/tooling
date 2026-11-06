import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/npm/capabilities.js';
import { planPublishableDependencies } from '#src/toolchains/npm/checks.js';
import { packNpm } from '#src/toolchains/npm/commands/pack-npm.js';
import { packNpmLeaf } from '#src/toolchains/npm/leaves.js';

/**
 * The npm toolchain's `gtb task` subcommands, what discovery detects for it,
 * and what it checks of the workspace's manifests.
 */
export const npmToolchain: Toolchain = {
  detects: Object.values(capabilities),
  plan: planPublishableDependencies,
  registrations: [
    { command: packNpm, leaf: packNpmLeaf },
  ],
};
