import { defineCommand } from 'citty';
import { sync } from './codegen/commands/sync.ts';
import { verify } from './codegen/commands/verify.ts';
import { rootNames } from './core/command-names.ts';
import { publish } from './release/commands/publish.ts';
import { version } from './release/commands/version.ts';
import { task } from './task.ts';
import { taskCommandName } from './tasks/names.ts';
import { hk } from './toolchains/hk/commands/hk.ts';
import { prepare } from './toolchains/skills/commands/prepare.ts';
import { turbo } from './toolchains/turbo/commands/turbo.ts';

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
