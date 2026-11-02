import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/eslint/capabilities.js';
import { lintEslint } from '#src/toolchains/eslint/commands/lint-eslint.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';

/**
 * The eslint toolchain's `gtb task` subcommands, and what discovery detects
 * for it.
 */
export const eslintToolchain: Toolchain = {
  detects: Object.values(capabilities),
  registrations: [
    { command: lintEslint, leaf: lintEslintLeaf },
  ],
};
