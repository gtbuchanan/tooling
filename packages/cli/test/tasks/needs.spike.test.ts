// SPIKE: the needs renderer reproduces the turbo edges the leaf built before.
import { describe, it } from 'vitest';
import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import { codegenDeps, rootSourceDeps } from '#src/tasks/edges.js';
import type { TaskGraph } from '#src/tasks/leaf.js';
import { turboDependsOn } from '#src/tasks/needs.js';
import { topo } from '#src/tasks/turbo-task.js';
import { compileTsNeeds, typecheckTsNeeds } from '#src/toolchains/typescript/leaves.js';

const discoveryWith = (generateScripts: readonly string[]): WorkspaceDiscovery => ({
  packages: [{ generateScripts }],
} as unknown as WorkspaceDiscovery);

const graphOf = (discovery: WorkspaceDiscovery): TaskGraph =>
  ({ discovery } as unknown as TaskGraph);

describe('typecheck:ts needs', () => {
  it.for([[[]], [['generate:api']]] as const)(
    'render the old turbo edges with generate scripts %j',
    ([scripts], { expect }) => {
      const discovery = discoveryWith(scripts);
      const graph = graphOf(discovery);

      expect(turboDependsOn(typecheckTsNeeds, { kind: 'package' }, discovery))
        .toStrictEqual([...codegenDeps(graph), Aggregate.transit]);
      expect(turboDependsOn(typecheckTsNeeds, { kind: 'root' }, discovery))
        .toStrictEqual(rootSourceDeps(graph));
      expect(turboDependsOn(compileTsNeeds, { kind: 'package' }, discovery))
        .toStrictEqual([topo('compile:ts'), ...codegenDeps(graph)]);
    },
  );
});
