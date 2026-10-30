import { Aggregate } from '#src/codegen/turbo-config.js';
import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import type { TaskGraph } from '#src/tasks/leaf.js';
import { topo } from '#src/tasks/turbo-task.js';

const hasGenerate = ({ packages }: WorkspaceDiscovery): boolean =>
  packages.some(pkg => pkg.generateScripts.length > 0);

/**
 * Codegen edges for a task reading its own package's sources and its
 * dependencies'. Generated files are usually gitignored, so an import of a
 * dependency's generated module races the codegen writing it unless ordered:
 * `transit` hashes the dependency but runs nothing, and `^compile:ts` skips a
 * source-only dependency.
 */
export const codegenDeps = (graph: TaskGraph): readonly string[] =>
  hasGenerate(graph.discovery) ? [Aggregate.generate, topo(Aggregate.generate)] : [];

/**
 * Edges for a root task reading the root's workspace dependencies as source.
 * Only the `^` forms: turbo resolves a bare name against the root itself,
 * where neither `generate` nor `transit` is defined.
 */
export const rootSourceDeps = (graph: TaskGraph): readonly string[] => [
  ...(hasGenerate(graph.discovery) ? [topo(Aggregate.generate)] : []),
  topo(Aggregate.transit),
];
