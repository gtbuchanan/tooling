import type { Toolchain } from '#src/tasks/toolchain.js';
import { planMiseTasks } from '#src/toolchains/hk/plan.js';

/**
 * What the hk toolchain keeps in the workspace: the mise tasks that run hk.
 * It has no `gtb task` subcommands: `gtb hk` is a root command.
 */
export const hkToolchain: Toolchain = {
  plan: planMiseTasks,
  registrations: [],
};
