import { defineCommand } from 'citty';
import { executeSarifBaseline, executeSarifCompare } from '../../lib/sarif-compare.ts';
import { rootNames } from './names.ts';

/**
 * `gtb sarif compare` — gates on regressions by diffing the current
 * SARIF logs against baseline logs from the merge base. A user command
 * rather than a turbo task: it consumes two generations of the same
 * task outputs, which turbo's task model can't express, and its result
 * depends on git state turbo can't hash.
 */
const compare = defineCommand({
  args: {
    'base': {
      description:
        'Git ref to diff against; lints its merge base with HEAD in a ' +
        'temporary worktree to produce the baseline (e.g. origin/main)',
      type: 'string',
    },
    'base-sha': {
      description:
        'Exact baseline commit, skipping merge-base resolution; CI ' +
        "passes the PR merge ref's first parent (git rev-parse HEAD^1)",
      type: 'string',
    },
  },
  meta: {
    description: 'Fail when SARIF findings are new relative to the baseline',
    name: 'compare',
  },
  run: ({ args }) =>
    executeSarifCompare({ baseRef: args.base, baseSha: args['base-sha'] }),
});

/**
 * `gtb sarif baseline` — snapshots HEAD's SARIF logs as the compare
 * baseline. Run on the default branch (where any future PR's merge base
 * is HEAD itself) so CI can cache the result for PR `sarif compare`
 * runs to restore.
 */
const baseline = defineCommand({
  meta: {
    description: "Snapshot HEAD's SARIF logs as the compare baseline",
    name: 'baseline',
  },
  run: () => executeSarifBaseline(),
});

/** `gtb sarif` — SARIF baselining: regression compare and baseline snapshot. */
export const sarif = defineCommand({
  meta: {
    description: 'Compare or snapshot SARIF static-analysis baselines',
    name: rootNames.sarif,
  },
  subCommands: { baseline, compare },
});
