import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/pkl/capabilities.js';
import { packPkl } from '#src/toolchains/pkl/commands/pack-pkl.js';
import { typecheckPkl } from '#src/toolchains/pkl/commands/typecheck-pkl.js';
import { packPklLeaf, typecheckPklLeaf } from '#src/toolchains/pkl/leaves.js';
import { planPklProjects } from '#src/toolchains/pkl/plan.js';

/**
 * The pkl toolchain's `gtb task` subcommands, what discovery detects for it,
 * and the `PklProject` fields it stamps.
 */
export const pklToolchain: Toolchain = {
  detects: Object.values(capabilities),
  plan: planPklProjects,
  registrations: [
    { command: packPkl, leaf: packPklLeaf },
    { command: typecheckPkl, leaf: typecheckPklLeaf },
  ],
};
