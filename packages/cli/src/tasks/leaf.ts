import type { PackageCapabilities, WorkspaceDiscovery } from '#src/core/discovery.js';
import type { AggregateName } from '#src/tasks/aggregates.js';
import type { TurboTask } from '#src/tasks/turbo-task.js';

/**
 * What a leaf's task may ask of the workspace, in place of a flag per leaf.
 *
 * Asked by leaf name, so a task depending on another leaf names that leaf
 * rather than the capability behind it.
 */
export interface TaskGraph {
  readonly discovery: WorkspaceDiscovery;
  /**
   * The leaf applies to some package. A single-package repo lists its root as
   * the lone package, so this covers that root too.
   */
  readonly applies: (leaf: string) => boolean;
  /**
   * The leaf applies to the workspace root as a root task of its own, which
   * needs a monorepo: a single-package root is already the package.
   */
  readonly appliesAtRoot: (leaf: string) => boolean;
  /**
   * The task keys that are members of an aggregate, ready for its dependsOn:
   * in registry order, each leaf's package task before its root task.
   */
  readonly membersOf: (aggregate: AggregateName) => readonly string[];
}

/**
 * A leaf the workspace root runs over files of its own, belonging to no package.
 */
export interface RootLeaf {
  /**
   * Arguments the root script passes after the leaf's name, where it passes any.
   */
  readonly args?: (discovery: WorkspaceDiscovery) => readonly string[];
  readonly appliesTo: (discovery: WorkspaceDiscovery) => boolean;
  readonly task: (graph: TaskGraph) => TurboTask;
}

/**
 * One leaf: what it applies to, the aggregate it belongs to, and the turbo task
 * that runs it.
 *
 * A leaf applying to a package gets a script there and a package task; one
 * applying to the root gets a root script and a `//#` task. Turbo never folds
 * the second into the first, which is why the root is a scope of its own
 * rather than one more package.
 */
export interface Leaf {
  /**
   * The aggregate that runs the leaf. A leaf belonging to none, such as an
   * upload CI runs on its own, runs only when named.
   */
  readonly aggregate?: AggregateName;
  readonly appliesTo: (pkg: PackageCapabilities) => boolean;
  /**
   * The `gtb task` argument, the script name and the task name at once.
   */
  readonly name: string;
  readonly root?: RootLeaf;
  readonly task: (graph: TaskGraph) => TurboTask;
}
