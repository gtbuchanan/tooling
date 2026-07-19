import { defineCommand } from 'citty';
import { executeLintEslintCompare } from '../../lib/lint-compare.ts';
import { rootNames } from './names.ts';

/**
 * `gtb lint:eslint:compare` — gates on lint regressions by diffing the
 * current SARIF logs against baseline logs from the merge base. A user
 * command rather than a turbo task: it consumes two generations of the
 * same task output, which turbo's task model can't express.
 */
export const lintEslintCompare = defineCommand({
  args: {
    base: {
      description:
        'Git ref to diff against; lints its merge base with HEAD in a ' +
        'temporary worktree to produce the baseline (e.g. origin/main)',
      type: 'string',
    },
  },
  meta: {
    description: 'Fail when lint violations are new relative to the SARIF baseline',
    name: rootNames.lintEslintCompare,
  },
  run: ({ args }) => executeLintEslintCompare({ baseRef: args.base }),
});
