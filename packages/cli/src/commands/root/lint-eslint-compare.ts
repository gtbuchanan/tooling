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
  meta: {
    description: 'Fail when lint violations are new relative to the SARIF baseline',
    name: rootNames.lintEslintCompare,
  },
  run: () => executeLintEslintCompare(),
});
