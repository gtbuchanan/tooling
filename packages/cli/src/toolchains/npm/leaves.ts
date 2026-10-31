import { outDirGlob, packNpmOutDirEntries } from '#src/core/dist-source.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { compileSkillsLeaf } from '#src/toolchains/skills/leaves.js';
import { compileTsLeaf } from '#src/toolchains/typescript/leaves.js';

/**
 * Stamps the published manifest and packs the npm tarball.
 */
export const packNpmLeaf: Leaf = {
  aggregate: Aggregate.pack,
  appliesTo: pkg => pkg.isPublished,
  name: 'pack:npm',
  task: graph => ({
    dependsOn: [
      compileTsLeaf.name,
      ...(graph.applies(compileSkillsLeaf.name) ? [compileSkillsLeaf.name] : []),
    ],
    /*
     * The compiled tree this packs is deliberately absent from the inputs.
     * Turbo folds a dependency's task hash into its dependents, so the
     * `compile:ts`/`compile:skills` edges above already key this task to the
     * sources that produce what it packs. Hashing the output directory on
     * top of that keys it to whatever a prior run happened to leave on
     * disk — the same sources then hash differently in a warm tree than on
     * a fresh checkout, costing cache hits without buying any correctness.
     *
     * What remains are the files pack:npm reads from outside the output
     * directory: the package README and the package-or-root LICENSE it
     * copies in so the tarball ships them, and the manifests it stamps the
     * published one from. The copies are outputs, so a cache hit restores
     * them.
     */
    inputs: [
      '$TURBO_ROOT$/LICENSE',
      '$TURBO_ROOT$/package.json',
      'LICENSE', 'README.md',
      'package.json',
    ],
    outputs: [
      'dist/packages/npm/**',
      ...packNpmOutDirEntries.map(outDirGlob),
    ],
  }),
};
