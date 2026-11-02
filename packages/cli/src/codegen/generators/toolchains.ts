import type { Generator } from '#src/codegen/generator.js';
import { toolchainChecks } from '#src/tasks/toolchain.js';
import { toolchains } from '#src/toolchains/index.js';

/**
 * What each toolchain checks of the workspace for itself. Those checks are
 * rules over hand-authored files rather than generated config, so there is
 * nothing to sync, and the scope keeps them selectable apart from any one
 * artifact's drift.
 */
export const toolchainsGenerator: Generator = {
  verify: ({ discovery }) => toolchainChecks(toolchains, { discovery }),
};
