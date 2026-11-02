import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/pkl/capabilities.js';
import { packPkl } from '#src/toolchains/pkl/commands/pack-pkl.js';
import { typecheckPkl } from '#src/toolchains/pkl/commands/typecheck-pkl.js';
import { packPklLeaf, typecheckPklLeaf } from '#src/toolchains/pkl/leaves.js';

/**
 * The pkl toolchain's `gtb task` subcommands, and what discovery detects for
 * it.
 */
export const pklToolchain: Toolchain = {
  detects: Object.values(capabilities),
  registrations: [
    { command: packPkl, leaf: packPklLeaf },
    { command: typecheckPkl, leaf: typecheckPklLeaf },
  ],
};
