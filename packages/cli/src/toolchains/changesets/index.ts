import type { Toolchain } from '#src/tasks/toolchain.js';
import { checkChangelogFormatting } from '#src/toolchains/changesets/checks.js';

/**
 * What the changesets toolchain checks of the workspace's release config. It
 * has no `gtb task` subcommands: `gtb version` and `gtb publish` drive
 * changesets from the release layer.
 */
export const changesetsToolchain: Toolchain = {
  checks: checkChangelogFormatting,
  registrations: [],
};
