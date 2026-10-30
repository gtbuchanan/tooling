import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import type { Leaf, TaskGraph } from '#src/tasks/leaf.js';
import { type TurboTask, rootTaskKey } from '#src/tasks/turbo-task.js';

/**
 * The {@link TaskGraph} a discovered workspace answers to, over the leaves given.
 */
export const createTaskGraph = (
  leaves: readonly Leaf[],
  discovery: WorkspaceDiscovery,
): TaskGraph => {
  const leafNamed = (name: string): Leaf => {
    const leaf = leaves.find(candidate => candidate.name === name);
    if (leaf === undefined) {
      throw new Error(`No leaf is registered as '${name}'`);
    }

    return leaf;
  };

  return {
    discovery,
    applies: name => discovery.packages.some(pkg => leafNamed(name).appliesTo(pkg)),
    appliesAtRoot: (name) => {
      const { root } = leafNamed(name);

      return discovery.isMonorepo && (root?.appliesTo(discovery) ?? false);
    },
  };
};

/**
 * The turbo tasks of the leaves applying in the workspace, keyed as turbo.json
 * keys them: a package task under the leaf's name, a root task under its `//#`
 * key.
 */
export const leafTasks = (
  leaves: readonly Leaf[],
  graph: TaskGraph,
): readonly (readonly [string, TurboTask])[] =>
  leaves.flatMap(leaf => [
    ...(graph.applies(leaf.name) ? [[leaf.name, leaf.task(graph)] as const] : []),
    ...(leaf.root !== undefined && graph.appliesAtRoot(leaf.name)
      ? [[rootTaskKey(leaf.name), leaf.root.task(graph)] as const]
      : []),
  ]);
