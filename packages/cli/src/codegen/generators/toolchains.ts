import type { Generator } from '#src/codegen/generator.js';
import { reportFindings, syncPlans } from '#src/codegen/plans.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { planFindings, toolchainPlans } from '#src/tasks/toolchain.js';
import { capabilities, toolchains } from '#src/toolchains/index.js';

const plans = toolchainPlans(toolchains);

/**
 * What each toolchain plans for the workspace: the files it owns, and the
 * rules over hand-authored files only an edit can satisfy.
 */
export const toolchainsGenerator: Generator = {
  sync: ({ discovery, force, logger }) => syncPlans(plans, {
    discover: () => discoverWorkspace({ capabilities, cwd: discovery.rootDir }),
    discovery,
    force,
    logger,
  }),
  verify: ({ discovery, ignored }) =>
    reportFindings(planFindings(plans, { discovery, force: false, ignored })),
};
