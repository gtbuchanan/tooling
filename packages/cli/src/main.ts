import { defineCommand } from 'citty';
import { sync } from '#src/codegen/commands/sync.js';
import { verify } from '#src/codegen/commands/verify.js';
import { rootNames } from '#src/core/command-names.js';
import { publish } from '#src/release/commands/publish.js';
import { version } from '#src/release/commands/version.js';
import { task } from '#src/task.js';
import { taskCommandName } from '#src/tasks/names.js';
import { hk } from '#src/toolchains/hk/commands/hk.js';
import { prepare } from '#src/toolchains/skills/commands/prepare.js';
import { turbo } from '#src/toolchains/turbo/commands/turbo.js';

/**
 * Root `gtb` command. Dispatches user commands at the root and leaf tools under `task`.
 */
export const main = defineCommand({
  meta: {
    description: 'Shared build CLI for @gtbuchanan/tooling',
    name: 'gtb',
  },
  subCommands: {
    [rootNames.hk]: hk,
    [rootNames.prepare]: prepare,
    [rootNames.publish]: publish,
    [rootNames.sync]: sync,
    [rootNames.turbo]: turbo,
    [rootNames.verify]: verify,
    [rootNames.version]: version,
    [taskCommandName]: task,
  },
});
