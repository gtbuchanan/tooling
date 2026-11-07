import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/typescript/capabilities.js';
import { compileTs } from '#src/toolchains/typescript/commands/compile-ts.js';
import { typecheckTs } from '#src/toolchains/typescript/commands/typecheck-ts.js';
import { compileTsLeaf, typecheckTsLeaf } from '#src/toolchains/typescript/leaves.js';
import { planTsconfigFiles } from '#src/toolchains/typescript/plan.js';

/**
 * The typescript toolchain's `gtb task` subcommands, what discovery detects
 * for it, and the tsconfigs it writes.
 */
export const typescriptToolchain: Toolchain = {
  detects: Object.values(capabilities),
  plan: planTsconfigFiles,
  registrations: [
    { command: compileTs, leaf: compileTsLeaf },
    { command: typecheckTs, leaf: typecheckTsLeaf },
  ],
};
