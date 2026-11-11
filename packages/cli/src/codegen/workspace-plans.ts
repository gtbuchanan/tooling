import { planScripts } from '#src/codegen/plan-scripts.js';
import { planTurbo } from '#src/codegen/plan-turbo.js';
import { type Plan, toolchainPlans } from '#src/tasks/toolchain.js';
import { toolchains } from '#src/toolchains/index.js';

/**
 * Every plan `gtb sync` applies and `gtb verify` reports. The scripts and
 * `turbo.json` are built from every toolchain's leaves, so no toolchain owns
 * them.
 */
export const workspacePlans: readonly Plan[] = [
  ...toolchainPlans(toolchains),
  planScripts,
  planTurbo,
];
