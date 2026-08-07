import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';
import { planTurboInvocation } from '../../lib/turbo-invocation.ts';
import { rootNames } from './names.ts';

/** `gtb turbo` — runs turbo, with an Android (Termux) escape hatch. */
export const turbo = defineCommand({
  meta: {
    description: 'Run turbo (with an Android escape hatch)',
    name: rootNames.turbo,
  },
  run: async ({ rawArgs }) => {
    const plan = planTurboInvocation({
      platform: process.platform,
      rawArgs,
    });
    if (plan.kind === 'error') {
      console.error(plan.message);
      process.exitCode = 1;
      return;
    }
    await run(plan.bin, { args: plan.args });
  },
});
