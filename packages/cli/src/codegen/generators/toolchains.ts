import type { Generator } from '#src/codegen/generator.js';
import { planScripts } from '#src/codegen/plan-scripts.js';
import { reportFindings, syncPlans } from '#src/codegen/plans.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { planFindings, toolchainPlans } from '#src/tasks/toolchain.js';
import { capabilities, toolchains } from '#src/toolchains/index.js';

// The scripts are built from every toolchain's leaves, so no toolchain owns them
const plans = [...toolchainPlans(toolchains), planScripts];

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
