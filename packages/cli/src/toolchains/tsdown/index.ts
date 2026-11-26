import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/tsdown/capabilities.js';
import { compileTsdown } from '#src/toolchains/tsdown/commands/compile-tsdown.js';
import { compileTsdownLeaf } from '#src/toolchains/tsdown/leaves.js';
import { planTsdownInstalled } from '#src/toolchains/tsdown/plan.js';

/**
 * The tsdown toolchain's `gtb task` subcommand, what discovery detects for
 * it, and the check that tsdown is installed where it bundles.
 */
export const tsdownToolchain: Toolchain = {
  detects: Object.values(capabilities),
  plan: planTsdownInstalled,
  registrations: [{ command: compileTsdown, leaf: compileTsdownLeaf }],
};
