// SPIKE: render compile:ts, typecheck:ts and generate as mise monorepo tasks.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { stringify } from 'smol-toml';
import { type WorkspacePackage, discoverWorkspace } from '#src/core/discovery.js';
import { toPosixRelative } from '#src/core/paths.js';
import { createTaskGraph } from '#src/tasks/graph.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { type MiseContext, type Need, miseEdges } from '#src/tasks/needs.js';
import { capabilities, leaves } from '#src/toolchains/index.js';
import {
  compileTsLeaf, compileTsNeeds, typecheckTsLeaf, typecheckTsNeeds,
} from '#src/toolchains/typescript/leaves.js';

const discovery = discoverWorkspace({ capabilities, cwd: process.argv[2] ?? process.cwd() });
const graph = createTaskGraph(leaves, discovery);
const turboRoot = '$TURBO_ROOT$/';
const rendered: readonly (readonly [Leaf, readonly Need[]])[] = [
  [compileTsLeaf, compileTsNeeds],
  [typecheckTsLeaf, typecheckTsNeeds],
];

// A turbo glob, made relative to the package for mise.
const localGlob = (pkg: WorkspacePackage, input: string): string =>
  (input.startsWith(turboRoot)
    ? path.posix.join(toPosixRelative(pkg.dir, discovery.rootDir), input.slice(turboRoot.length))
    : input);

const context: MiseContext = {
  discovery,
  hasTask: (name, pkg) => rendered.some(([leaf]) => leaf.name === name && leaf.appliesTo(pkg)),
  // A dependency's own sources: its typecheck inputs, which cover what it ships and tests.
  inputsOf: pkg => (typecheckTsLeaf.task(graph).inputs ?? []).map(input => localGlob(pkg, input)),
};

const tasksFor = (pkg: WorkspacePackage): Record<string, object> => {
  const tasks: Record<string, object> = {};
  for (const [leaf, needs] of rendered.filter(([candidate]) => candidate.appliesTo(pkg))) {
    const { depends, sources } = miseEdges(needs, pkg, context);
    const { inputs = [], outputs = [] } = leaf.task(graph);
    tasks[leaf.name] = {
      depends,
      outputs: outputs.length > 0 ? outputs : { auto: true },
      run: `pnpm run gtb task ${leaf.name}`,
      sources: [...inputs.map(input => localGlob(pkg, input)), ...sources],
    };
  }
  // Author codegen: no declared inputs or outputs, so it always runs, as turbo's uncached form does.
  if (pkg.generateScripts.length > 0) {
    tasks['generate'] = { depends: pkg.generateScripts };
    for (const script of pkg.generateScripts) {
      tasks[script] = { run: `pnpm run ${script}` };
    }
  }
  return tasks;
};

for (const pkg of discovery.packages) {
  const tasks = tasksFor(pkg);
  if (Object.keys(tasks).length > 0) {
    writeFileSync(path.join(pkg.dir, 'mise.toml'), `${stringify({ tasks })}\n`);
  }
}
