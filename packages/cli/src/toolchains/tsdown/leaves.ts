import { Aggregate } from '#src/tasks/aggregates.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { tsdownConfig } from '#src/toolchains/tsdown/capabilities.js';
import { compileTask, compileTsLeaf } from '#src/toolchains/typescript/leaves.js';

/**
 * A bundle of a published package, in place of `compile:ts`. It inlines what
 * the package's `devDependencies` reach, private workspace packages included,
 * which tsc would leave as imports no registry can resolve.
 */
export const compileTsdownLeaf: Leaf = {
  aggregate: Aggregate.compile,
  appliesTo: pkg => pkg.capabilities.has(published) && pkg.capabilities.has(tsdownConfig),
  name: 'compile:tsdown',
  supersedes: [compileTsLeaf.name],
  task: graph => compileTask(graph, ['tsdown.config.*']),
};
