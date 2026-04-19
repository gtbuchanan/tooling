import path from 'node:path';
import * as v from 'valibot';
import { readJsonFile } from '../lib/file-writer.ts';
import { run } from '../lib/process.ts';
import { SchedulerInputSchema, resolveSchedule } from '../lib/task-graph.ts';
import { resolveWorkspace } from '../lib/workspace.ts';

/** Runs a single task across all workspace packages. */
const runTask = async (task: string, rootDir: string): Promise<void> => {
  await run('pnpm', {
    args: ['-r', '--if-present', 'run', task],
    cwd: rootDir,
  });
};

/**
 * Runs a turbo-style task pipeline without the turbo binary.
 *
 * Reads turbo.json, resolves the dependency graph for the requested task,
 * and executes leaf tasks level-by-level using `pnpm -r --if-present run`.
 * Aggregate (transit-node) tasks are skipped — only executable leaf tasks run.
 */
export const pipeline = async (args: readonly string[]): Promise<void> => {
  const taskName = args[0];
  if (taskName === undefined) {
    throw new Error('Usage: gtb pipeline <task>');
  }

  const { rootDir } = resolveWorkspace();
  const turboPath = path.join(rootDir, 'turbo.json');
  const turboJson = v.parse(SchedulerInputSchema, readJsonFile(turboPath));
  const schedule = resolveSchedule(taskName, turboJson);

  if (schedule.length === 0) {
    console.log(`pipeline: no tasks to run for '${taskName}'`);
    return;
  }

  const totalTasks = schedule.reduce((sum, level) => sum + level.length, 0);
  console.log(
    `pipeline: ${taskName} → ${String(totalTasks)} tasks in ${String(schedule.length)} levels`,
  );

  for (const [index, level] of schedule.entries()) {
    const label = `[${String(index + 1)}/${String(schedule.length)}]`;
    console.log(`${label} ${level.join(', ')}`);
    await Promise.all(level.map(task => runTask(task, rootDir)));
  }
};
