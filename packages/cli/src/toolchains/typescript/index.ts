import type { Toolchain } from '#src/tasks/toolchain.js';
import { compileTs } from '#src/toolchains/typescript/commands/compile-ts.js';
import { typecheckTs } from '#src/toolchains/typescript/commands/typecheck-ts.js';
import { compileTsLeaf, typecheckTsLeaf } from '#src/toolchains/typescript/leaves.js';

/**
 * The typescript toolchain's `gtb task` subcommands.
 */
export const typescriptToolchain: Toolchain = {
  registrations: [
    { command: compileTs, leaf: compileTsLeaf },
    { command: typecheckTs, leaf: typecheckTsLeaf },
  ],
};
