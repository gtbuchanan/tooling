import {
  buildOutDir, outDirGlob, packNpmOutDirEntries, skillsOutDirEntry,
} from '#src/core/dist-source.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import { codegenDeps, rootSourceDeps } from '#src/tasks/edges.js';
import type { Leaf, TaskGraph } from '#src/tasks/leaf.js';
import { toTurboGlobs } from '#src/tasks/turbo-globs.js';
import { topo } from '#src/tasks/turbo-task.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { deploySkillsLeaf } from '#src/toolchains/skills/leaves.js';
import { typescript, typescriptSources } from '#src/toolchains/typescript/capabilities.js';
import { buildInclude, typeCheckInclude } from '#src/toolchains/typescript/layout.js';

/**
 * `tsc --noEmit` over the package's `include`.
 */
export const typecheckTsLeaf: Leaf = {
  aggregate: Aggregate.typecheck,
  appliesTo: pkg => pkg.capabilities.has(typescript),
  name: 'typecheck:ts',
  /*
   * The root's own type check. Like `//#lint:eslint` it depends on `^transit`
   * (and `^generate`), which turbo resolves through the root manifest's
   * workspace dependencies, so an edit to a package the root consumes reaches
   * its hash. Nothing is lost on the
   * artifact side — workspace packages export TypeScript source in-workspace,
   * so the root type-checks against sources without waiting on a compile.
   *
   * The inputs need no `$TURBO_ROOT$` prefix (a root task already runs there)
   * and no package-glob subtraction: `toTurboGlobs` expands `*` and `.*` to
   * root-level file patterns rather than recursive ones, and the named
   * directories are the root's own.
   *
   * Gated on the root's `typescriptSources` rather than its `typescript`:
   * `gtb sync` writes a root `tsconfig.json` unconditionally, so the latter
   * holds at every synced root, and a task gated on it would run tsc over a
   * root with nothing to check — TS18003, an error rather than a no-op.
   */
  root: {
    appliesTo: discovery => discovery.root.capabilities.has(typescriptSources),
    task: graph => ({
      dependsOn: rootSourceDeps(graph),
      inputs: [
        'tsconfig.base.json',
        ...typeCheckInclude.flatMap(toTurboGlobs),
        'tsconfig.json', 'tsconfig.*.json',
      ],
      outputs: [],
    }),
  },
  task: graph => ({
    dependsOn: [...codegenDeps(graph), Aggregate.transit],
    inputs: [
      '$TURBO_ROOT$/tsconfig.base.json',
      ...typeCheckInclude.flatMap(toTurboGlobs),
      'tsconfig.json', 'tsconfig.*.json',
    ],
    outputs: [],
  }),
};

/*
 * The compiled tree is everything in the output directory the sibling tasks
 * don't write. Subtracting theirs keeps each task's cache entry to what it
 * produced: a shared file captured here would be restored on a `compile:ts`
 * hit, replaying whatever the entry was written with — a stamped manifest
 * carrying a stale version, for instance.
 */
const compileTsOutputs = (graph: TaskGraph): readonly string[] => [
  `${buildOutDir}/**`,
  ...packNpmOutDirEntries.map(entry => `!${outDirGlob(entry)}`),
  ...(graph.applies(deploySkillsLeaf.name) ? [`!${outDirGlob(skillsOutDirEntry)}/**`] : []),
];

/**
 * `tsc -p tsconfig.build.json` into the build output directory.
 */
export const compileTsLeaf: Leaf = {
  aggregate: Aggregate.compile,
  appliesTo: pkg => pkg.capabilities.has(published),
  name: 'compile:ts',
  task: graph => ({
    dependsOn: [topo(compileTsLeaf.name), ...codegenDeps(graph)],
    inputs: [
      '$TURBO_ROOT$/tsconfig.base.json', '$TURBO_ROOT$/tsconfig.build.json',
      ...buildInclude.flatMap(toTurboGlobs), 'tsconfig.build.json',
    ],
    outputs: compileTsOutputs(graph),
  }),
};
