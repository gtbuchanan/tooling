import type { WorkspaceDiscovery, WorkspacePackage } from '#src/core/discovery.js';
import type { AggregateName } from '#src/tasks/aggregates.js';
import type { TurboTask } from '#src/tasks/turbo-task.js';

/**
 * Name of the root `task` subcommand hub every leaf's script runs through.
 */
export const taskCommandName = 'task';

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
   * the root's first, as //# keys, then the packages', each in registry order.
   */
  readonly membersOf: (aggregate: AggregateName) => readonly string[];
  /**
   * The leaf and every leaf superseding it, those applying to some package, in
   * registry order: what a task waiting on the leaf waits on, so the waiting
   * toolchain need not know which toolchain took over.
   */
  readonly withSuperseding: (leaf: string) => readonly string[];
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
 * A report a leaf writes, for another toolchain's leaf to publish without
 * knowing which tool wrote it. The path is relative to the package.
 */
export type Report =
  | { readonly format: 'junit'; readonly kind: 'test-results'; readonly path: string }
  | { readonly format: 'lcov'; readonly kind: 'coverage'; readonly path: string };

/**
 * What a publishing leaf publishes.
 */
export type ReportKind = Report['kind'];

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
  readonly appliesTo: (pkg: WorkspacePackage) => boolean;
  /**
   * The `gtb task` argument, the script name and the task name at once.
   */
  readonly name: string;
  /**
   * The reports the leaf writes, which a leaf publishing their kind uploads.
   */
  readonly reports?: readonly Report[];
  readonly root?: RootLeaf;
  /**
   * Names of other toolchains' leaves this one replaces in the packages it
   * applies to, as tsdown replaces `compile:ts`. The registry narrows each
   * superseded leaf to the packages nothing supersedes it in, so the
   * dependency runs from the superseding toolchain to the superseded one and
   * never back. A root variant is not narrowed.
   */
  readonly supersedes?: readonly string[];
  readonly task: (graph: TaskGraph) => TurboTask;
}

/**
 * A leaf publishing every report of one kind, which the registry applies
 * wherever a leaf declaring such a report applies. It names the kind in place
 * of `appliesTo`, so the publishing toolchain never imports the declaring one.
 * It declares no reports itself, since the registry reads reports from the
 * declaring leaves alone, and supersedes nothing: supersession reaches it
 * through the declaring leaves it follows.
 */
export type PublishingLeaf = Omit<Leaf, 'appliesTo' | 'reports' | 'supersedes'> & {
  readonly publishes: ReportKind;
};
