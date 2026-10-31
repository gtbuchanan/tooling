import type { Toolchain } from '#src/tasks/toolchain.js';
import { lintEslint } from '#src/toolchains/eslint/commands/lint-eslint.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';

/**
 * The eslint toolchain's `gtb task` subcommands.
 */
export const eslintToolchain: Toolchain = {
  registrations: [
    { command: lintEslint, leaf: lintEslintLeaf },
  ],
};
