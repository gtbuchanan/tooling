import { defineCommand } from 'citty';
import { taskCommandName } from '#src/tasks/leaf.js';
import { taskSubCommands } from '#src/tasks/toolchain.js';
import { toolchains } from '#src/toolchains/index.js';

/**
 * `gtb task <name>` — invokes a single leaf build tool.
 */
export const task = defineCommand({
  meta: {
    description: 'Run a single leaf build tool (intended for turbo tasks)',
    name: taskCommandName,
  },
  subCommands: taskSubCommands(toolchains),
});

export { prepack } from '#src/toolchains/npm/commands/pack-npm.js';
