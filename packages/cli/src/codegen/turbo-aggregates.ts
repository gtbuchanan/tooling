import { Aggregate, type AggregateName } from '#src/tasks/aggregates.js';
import { workspaceGenerateScripts } from '#src/tasks/edges.js';
import type { TaskGraph } from '#src/tasks/leaf.js';
import { type TurboTask, topo } from '#src/tasks/turbo-task.js';

/**
 * A turbo.json task entry: its key and its definition.
 */
export type TaskEntry = readonly [string, TurboTask];

/*
 * `generate:*` scripts are author-owned codegen. Discovery finds the names,
 * but nothing in the manifest says what a script writes, so gtb cannot
 * declare `outputs` for one — and an outputs-less task caches logs only, so a
 * cache hit replays them, skips the run, and restores nothing. The generated
 * files then never appear and every downstream task happily reads whatever is
 * on disk (or nothing).
 *
 * Monorepos therefore push the leaves down to the packages, using the seam
 * turbo provides for exactly this: each package declares `generate` plus its
 * own leaves — with real inputs and outputs — in a package configuration
 * (`packages/<pkg>/turbo.json` extending `//`). Only the package knows what
 * its codegen emits. A package that skips the wiring silently never
 * generates, so `gtb verify` asserts it (see `checkGenerateConfigs`).
 *
 * The root aggregate names no leaves, only `^generate`, so a package with no
 * codegen of its own still orders its consumers behind its dependencies'.
 * A package configuration's `dependsOn` replaces the root's, so verify also
 * asserts each one keeps it through `$TURBO_EXTENDS$`.
 *
 * Single-package repos get no such seam — turbo supports package
 * configurations only for workspace packages, and the lone turbo.json is
 * sync-owned — so the leaves are declared here and opted out of caching.
 * Uncached codegen always runs, which is slower than a cache hit but never
 * silently absent.
 */

const generateTasks = ({ discovery }: TaskGraph): readonly TaskEntry[] => {
  const scripts = workspaceGenerateScripts(discovery);
  if (scripts.length === 0) {
    return [];
  }
  if (discovery.isMonorepo) {
    return [[Aggregate.generate, { dependsOn: [topo(Aggregate.generate)] }]];
  }

  return [
    [Aggregate.generate, { dependsOn: scripts }],
    ...scripts.map((script): TaskEntry => [script, { cache: false }]),
  ];
};

/*
 * Turbo folds a workspace dependency's sources into a consumer's hash only
 * through a task edge. `typecheck:ts`, `lint:eslint`, and the vitest tasks read
 * a dependency as source rather than as a build artifact, so they have no
 * artifact task to gate on and would replay a cached pass after that dependency
 * changed. `^compile:ts` covers only dependencies that actually compile; a
 * source-only package (test fixtures, shared helpers) declares no such script
 * and propagates nothing.
 *
 * `transit` is turbo's seam for that: a scriptless node whose only edge is
 * `^transit`. It declares no `inputs`, so turbo hashes the whole package, and
 * it runs nothing, so nothing serializes — depending on it simply pulls every
 * transitive workspace dependency's file hashes into the consumer's task hash.
 *
 * The root's lint and type-check tasks reach it too, through `^transit`.
 *
 * Emitted only when something references it, so a workspace with none of
 * these tasks doesn't carry a dangling node.
 */

const transitNode = (leafEntries: readonly TaskEntry[]): readonly TaskEntry[] => {
  const references = new Set<string>([Aggregate.transit, topo(Aggregate.transit)]);
  const isReferenced = leafEntries.some(([, task]) =>
    task.dependsOn?.some(dep => references.has(dep)) ?? false);

  return isReferenced ? [[Aggregate.transit, { dependsOn: [topo(Aggregate.transit)] }]] : [];
};

/*
 * An aggregate is declared only where it has members, since a dependsOn
 * naming a task the graph does not declare fails the run. Root tasks are
 * members in their own right: turbo does not roll them into the bare task
 * name when resolving deps.
 */
const aggregate = (name: string, members: readonly string[]): readonly TaskEntry[] =>
  members.length > 0 ? [[name, { dependsOn: members }]] : [];

const declared = (entries: readonly TaskEntry[], names: readonly string[]): readonly string[] =>
  names.filter(name => entries.some(([key]) => key === name));

const leafAggregates = (graph: TaskGraph, names: readonly AggregateName[]): readonly TaskEntry[] =>
  names.flatMap(name => aggregate(name, graph.membersOf(name)));

/**
 * The aggregate tasks, and the `generate` and `transit` nodes, for the
 * leaf tasks the workspace declares.
 */
export const aggregateTasks = (
  graph: TaskGraph,
  leafEntries: readonly TaskEntry[],
): readonly TaskEntry[] => {
  const kinds = leafAggregates(graph, [
    Aggregate.typecheck, Aggregate.compile, Aggregate.pack, Aggregate.lint,
  ]);
  const check = aggregate(Aggregate.check, [
    ...declared(kinds, [Aggregate.typecheck, Aggregate.lint]),
    ...graph.membersOf(Aggregate.check),
  ]);
  const tests = leafAggregates(graph, [
    Aggregate.testSlow, Aggregate.testE2e, Aggregate.coverageMerge,
  ]);
  const ciDeps = declared(
    [...check, ...kinds],
    [Aggregate.check, Aggregate.compile, Aggregate.pack],
  );

  return [
    ...generateTasks(graph),
    ...transitNode(leafEntries),
    ...kinds,
    ...check,
    ...tests,
    ...aggregate(Aggregate.buildCi, ciDeps),
    ...aggregate(Aggregate.build, [
      ...ciDeps,
      ...declared(tests, [Aggregate.testSlow, Aggregate.testE2e]),
      ...graph.membersOf(Aggregate.build),
    ]),
  ];
};
