import * as v from 'valibot';

const SchedulerTaskSchema = v.object({
  dependsOn: v.optional(v.array(v.string())),
  env: v.optional(v.array(v.string())),
  inputs: v.optional(v.array(v.string())),
  outputs: v.optional(v.array(v.string())),
});

/** Valibot schema for parsing turbo.json into scheduler input. */
export const SchedulerInputSchema = v.object({
  tasks: v.record(v.string(), SchedulerTaskSchema),
});

/** Minimal task shape consumed by the scheduler (compatible with parsed JSON). */
export type SchedulerTask = v.InferOutput<typeof SchedulerTaskSchema>;

/** Minimal turbo.json shape consumed by the scheduler. */
export type SchedulerInput = v.InferOutput<typeof SchedulerInputSchema>;

/** A topologically sorted list of task levels to execute sequentially. */
export type TaskSchedule = readonly (readonly string[])[];

/** Strips the `^` prefix from topological dependency references. */
const stripTopo = (dep: string): string =>
  dep.startsWith('^') ? dep.slice(1) : dep;

/** Context for recursive dependency graph traversal. */
interface TraversalContext {
  readonly filter?: ReadonlySet<string> | undefined;
  readonly result: Set<string>;
  readonly tasks: SchedulerInput['tasks'];
  readonly visited: Set<string>;
}

/**
 * Collects task names reachable from a root via `dependsOn`, optionally
 * filtering to only record names present in `filter`.
 */
const collectReachable = (
  taskName: string,
  ctx: TraversalContext,
): void => {
  if (ctx.visited.has(taskName)) {
    return;
  }
  ctx.visited.add(taskName);

  if (ctx.filter === undefined || ctx.filter.has(taskName)) {
    ctx.result.add(taskName);
  }

  const task = ctx.tasks[taskName];
  if (task?.dependsOn === undefined) {
    return;
  }
  for (const raw of task.dependsOn) {
    collectReachable(stripTopo(raw), ctx);
  }
};

/** Collects all task names transitively reachable from a root. */
const allReachable = (
  taskName: string,
  tasks: SchedulerInput['tasks'],
): ReadonlySet<string> => {
  const result = new Set<string>();
  collectReachable(taskName, { result, tasks, visited: new Set() });
  return result;
};

/** Collects only the names in `filter` that are reachable from a root. */
const filteredReachable = (
  taskName: string,
  tasks: SchedulerInput['tasks'],
  filter: ReadonlySet<string>,
): ReadonlySet<string> => {
  const result = new Set<string>();
  collectReachable(taskName, { filter, result, tasks, visited: new Set() });
  result.delete(taskName);
  return result;
};

/**
 * Leaf tasks have `inputs`, `outputs`, or `env` — aggregate tasks have
 * only `dependsOn`.
 */
const isLeafTask = (task: SchedulerTask): boolean =>
  task.inputs !== undefined ||
  task.outputs !== undefined ||
  task.env !== undefined;

/**
 * Resolves a turbo task into a topologically ordered schedule of leaf
 * tasks. Aggregate (transit-node) tasks are traversed but not included
 * in the output — only executable leaf tasks appear.
 *
 * Each inner array is a "level" of tasks whose dependencies are all
 * satisfied by prior levels.
 */
export const resolveSchedule = (
  taskName: string,
  turboJson: SchedulerInput,
): TaskSchedule => {
  const { tasks } = turboJson;

  const reachable = allReachable(taskName, tasks);

  const leafNames = [...reachable].filter((name) => {
    const task = tasks[name];
    return task !== undefined && isLeafTask(task);
  });

  const leafSet = new Set(leafNames);
  const deps = new Map(
    leafNames.map(name => [name, filteredReachable(name, tasks, leafSet)]),
  );

  /* Kahn's algorithm for topological level ordering. */
  const remaining = new Map(
    [...deps].map(([name, depSet]) => [name, new Set(depSet)]),
  );
  const schedule: string[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, depSet]) => depSet.size === 0)
      .map(([name]) => name)
      .toSorted();

    if (ready.length === 0) {
      const cycle = [...remaining.keys()].toSorted().join(', ');
      throw new Error(`Cycle detected in task graph: ${cycle}`);
    }

    schedule.push(ready);
    for (const name of ready) {
      remaining.delete(name);
    }
    for (const depSet of remaining.values()) {
      for (const name of ready) {
        depSet.delete(name);
      }
    }
  }

  return schedule;
};
