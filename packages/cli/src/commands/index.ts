import { defineCommand } from 'citty';
import { hk } from './root/hk.ts';
import { rootNames } from './root/names.ts';
import { prepare } from './root/prepare.ts';
import { publish } from './root/publish.ts';
import { sync } from './root/sync.ts';
import { turbo } from './root/turbo.ts';
import { verify } from './root/verify.ts';
import { task } from './task/index.ts';
import { taskCommandName } from './task/names.ts';

/** Root `gtb` command. Dispatches user commands at the root and leaf tools under `task`. */
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
    [taskCommandName]: task,
  },
});
