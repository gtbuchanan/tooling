import { type Scripts, resolveParallelCommand, toCommandString } from '../../lib/hook.ts';
import type { ParallelCommand } from '../../lib/process.ts';
import { lintEslint, lintOxlint } from '../leaf/index.ts';

/** Parallel commands for the lint step (oxlint + eslint). */
export const lintParallelCmds = (scripts: Scripts): readonly ParallelCommand[] => [
  resolveParallelCommand(scripts, lintOxlint, toCommandString(lintOxlint)),
  resolveParallelCommand(scripts, lintEslint, toCommandString(lintEslint)),
];
