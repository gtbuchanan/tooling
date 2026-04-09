import { type Scripts, resolveParallelCommand } from '../../lib/hook.ts';
import type { ParallelCommand } from '../../lib/process.ts';

/** Parallel commands for the lint step (oxlint + eslint). */
export const lintParallelCmds = (scripts: Scripts): readonly ParallelCommand[] => [
  resolveParallelCommand(scripts, 'lint:oxlint', 'oxlint'),
  resolveParallelCommand(scripts, 'lint:eslint', 'eslint --max-warnings=0'),
];
