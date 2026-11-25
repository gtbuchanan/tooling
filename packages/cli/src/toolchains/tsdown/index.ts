import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/tsdown/capabilities.js';
import { compileTsdown } from '#src/toolchains/tsdown/commands/compile-tsdown.js';
import { compileTsdownLeaf } from '#src/toolchains/tsdown/leaves.js';

/**
 * The tsdown toolchain's `gtb task` subcommand and what discovery detects for
 * it.
 */
export const tsdownToolchain: Toolchain = {
  detects: Object.values(capabilities),
  registrations: [{ command: compileTsdown, leaf: compileTsdownLeaf }],
};
