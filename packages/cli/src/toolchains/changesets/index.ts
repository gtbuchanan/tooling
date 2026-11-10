import type { Toolchain } from '#src/tasks/toolchain.js';
import { planChangesetsConfig } from '#src/toolchains/changesets/plan.js';

/**
 * What the changesets toolchain keeps in the workspace's release config. It
 * has no `gtb task` subcommands: `gtb version` and `gtb publish` drive
 * changesets from the release layer.
 */
export const changesetsToolchain: Toolchain = {
  plan: planChangesetsConfig,
  registrations: [],
};
