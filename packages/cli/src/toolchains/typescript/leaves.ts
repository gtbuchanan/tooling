import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import {
  buildOutDir, outDirGlob, packNpmOutDirEntries, skillsOutDirEntry,
} from '#src/core/dist-source.js';
import { typeCheckInclude } from '#src/core/layout.js';
import { localeComparer } from '#src/core/sort.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import { codegenDeps, rootSourceDeps } from '#src/tasks/edges.js';
import type { Leaf, TaskGraph } from '#src/tasks/leaf.js';
import { toTurboGlobs } from '#src/tasks/turbo-globs.js';
import { topo } from '#src/tasks/turbo-task.js';
import { deploySkillsLeaf } from '#src/toolchains/skills/leaves.js';

/**
 * `tsc --noEmit` over the package's `include`.
 */
export const typecheckTsLeaf: Leaf = {
  aggregate: Aggregate.typecheck,
  appliesTo: pkg => pkg.hasTypeScript,
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
   * Gated on the root's `hasTypeScriptSources` rather than its
   * `hasTypeScript`: `gtb sync` writes a root `tsconfig.json`
   * unconditionally, so the latter is true at every synced root, and a task
   * gated on it would run tsc over a root with nothing to check — TS18003, an
   * error rather than a no-op.
   */
  root: {
    appliesTo: discovery => discovery.root.hasTypeScriptSources,
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
 * Union of tsconfig.build.json `include` directories across published
 * packages.
 */
const compileIncludes = ({ packages }: WorkspaceDiscovery): readonly string[] =>
  [...new Set(packages.flatMap(pkg => (pkg.isPublished ? pkg.buildIncludes : [])))]
    .toSorted(localeComparer);

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
  appliesTo: pkg => pkg.isPublished,
  name: 'compile:ts',
  task: graph => ({
    dependsOn: [topo(compileTsLeaf.name), ...codegenDeps(graph)],
    inputs: [
      '$TURBO_ROOT$/tsconfig.base.json', '$TURBO_ROOT$/tsconfig.build.json',
      ...compileIncludes(graph.discovery).flatMap(toTurboGlobs), 'tsconfig.build.json',
    ],
    outputs: compileTsOutputs(graph),
  }),
};
