import type { Toolchain } from '#src/tasks/toolchain.js';
import { planMiseFragment } from '#src/toolchains/mise/plan.js';

/**
 * What the mise toolchain keeps in the workspace: gtb's conf.d fragment, which
 * carries the tasks other toolchains contribute. It has no `gtb task`
 * subcommands.
 */
export const miseToolchain: Toolchain = {
  plan: planMiseFragment,
  registrations: [],
};
