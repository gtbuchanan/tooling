import type { Toolchain } from '#src/tasks/toolchain.js';
import { packPkl } from '#src/toolchains/pkl/commands/pack-pkl.js';
import { typecheckPkl } from '#src/toolchains/pkl/commands/typecheck-pkl.js';
import { packPklLeaf, typecheckPklLeaf } from '#src/toolchains/pkl/leaves.js';

/**
 * The pkl toolchain's `gtb task` subcommands.
 */
export const pklToolchain: Toolchain = {
  registrations: [
    { command: packPkl, leaf: packPklLeaf },
    { command: typecheckPkl, leaf: typecheckPklLeaf },
  ],
};
