import { codegenDeps, rootSourceDeps } from '#src/codegen/leaf-edges.js';
import { testLeaves } from '#src/codegen/test-leaves.js';
import { Aggregate } from '#src/codegen/turbo-config.js';
import { toTurboGlobs } from '#src/codegen/turbo-globs.js';
import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import {
  buildOutDir, outDirGlob, packNpmOutDirEntries, skillsOutDirEntry,
} from '#src/core/dist-source.js';
import { typeCheckInclude } from '#src/core/layout.js';
import { localeComparer } from '#src/core/sort.js';
import type { Leaf, TaskGraph } from '#src/tasks/leaf.js';
import { taskNames } from '#src/tasks/names.js';
import { rootTaskKey, topo } from '#src/tasks/turbo-task.js';
import { skillsConfigFilename } from '#src/toolchains/skills/skills-config.js';

/*
 * Converts a pnpm workspace package glob into an ESLint/turbo ignore
 * pattern that matches files under any directory the glob resolves to.
 * `packages/*` → `packages/*​/**` (descendants of any direct subdir).
 */
const toPackageIgnore = (glob: string): string => `${glob}/**`;

const typecheckTs: Leaf = {
  appliesTo: pkg => pkg.hasTypeScript,
  name: taskNames.typecheckTs,
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
  ...(graph.applies(taskNames.deploySkills) ? [`!${outDirGlob(skillsOutDirEntry)}/**`] : []),
];

const compileTs: Leaf = {
  appliesTo: pkg => pkg.isPublished,
  name: taskNames.compileTs,
  task: graph => ({
    dependsOn: [topo(taskNames.compileTs), ...codegenDeps(graph)],
    inputs: [
      '$TURBO_ROOT$/tsconfig.base.json', '$TURBO_ROOT$/tsconfig.build.json',
      ...compileIncludes(graph.discovery).flatMap(toTurboGlobs), 'tsconfig.build.json',
    ],
    outputs: compileTsOutputs(graph),
  }),
};

/*
 * Runs in a package that both publishes and authors skills. Skills and
 * publishing on different packages leave the task with nothing to run.
 */
const compileSkills: Leaf = {
  appliesTo: pkg => pkg.isPublished && pkg.hasSkills,
  name: taskNames.compileSkills,
  task: () => ({
    inputs: ['skills/**'],
    outputs: [`${outDirGlob(skillsOutDirEntry)}/**`],
  }),
};

const packNpm: Leaf = {
  appliesTo: pkg => pkg.isPublished,
  name: taskNames.packNpm,
  task: graph => ({
    dependsOn: [
      taskNames.compileTs,
      ...(graph.applies(taskNames.compileSkills) ? [taskNames.compileSkills] : []),
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

/*
 * Pkl package tasks. `typecheck:pkl` evaluates the modules to validate them
 * (`pkl eval` renders to stdout, which the handler discards — pure
 * validation, hence no outputs, mirroring `typecheck:ts`). `pack:pkl` is the
 * sole artifact-producing step (`pkl project package` → the release zip),
 * mirroring `pack:npm`. There is no `compile:pkl`: nothing consumes a rendered
 * intermediate — consumers import the source `.pkl` shipped inside the zip.
 */
const pklInputs = ['*.pkl', 'PklProject'];

const typecheckPkl: Leaf = {
  appliesTo: pkg => pkg.hasPkl,
  name: taskNames.typecheckPkl,
  task: () => ({ inputs: pklInputs, outputs: [] }),
};

const packPkl: Leaf = {
  appliesTo: pkg => pkg.hasPklPackage,
  name: taskNames.packPkl,
  task: () => ({
    dependsOn: [taskNames.typecheckPkl],
    inputs: [...pklInputs, 'package.json'],
    outputs: ['dist/packages/pkl/**'],
  }),
};

/*
 * The `transit` edge is declared rather than inherited through `typecheck:ts`:
 * that edge is optional (consumers may drop it for parallelism) and isn't
 * generated at all for a workspace without TypeScript, so relying on it would
 * make lint's cross-package invalidation silently conditional.
 */
const lintEslint: Leaf = {
  appliesTo: pkg => pkg.hasEslint,
  name: taskNames.lintEslint,
  /*
   * Patterns use double quotes for cross-platform shell compatibility:
   * cmd.exe treats single quotes as literal characters (Windows pnpm
   * default), while both shells respect double quotes for arg grouping.
   *
   * `$TURBO_DEFAULT$` expands to root files minus gitignored paths
   * (dist/, node_modules/, .turbo/, .claude/worktrees/); only package
   * dirs need explicit subtraction since they're tracked but owned by
   * per-package lint. Cache file lives in the root cwd's dist/,
   * distinct from per-package caches that live in each package's dist/.
   */
  root: {
    args: ({ packageGlobs }) => [
      '.',
      ...packageGlobs.flatMap(glob => ['--ignore-pattern', `"${toPackageIgnore(glob)}"`]),
    ],
    appliesTo: discovery => discovery.root.hasEslint,
    task: graph => ({
      dependsOn: rootSourceDeps(graph),
      inputs: [
        '$TURBO_DEFAULT$',
        ...graph.discovery.packageGlobs.map(glob => `!${toPackageIgnore(glob)}`),
      ],
      outputs: ['dist/.eslintcache'],
    }),
  },
  task: graph => ({
    dependsOn: [
      ...codegenDeps(graph),
      ...(graph.applies(taskNames.typecheckTs) ? [taskNames.typecheckTs] : []),
      Aggregate.transit,
    ],
    inputs: [
      '$TURBO_ROOT$/eslint.config.*',
      'bin/**', 'src/**', 'test/**', 'e2e/**', 'scripts/**', 'skills/**',
      'eslint.config.*',
    ],
    outputs: ['dist/.eslintcache'],
  }),
};

const deploySkills: Leaf = {
  appliesTo: pkg => pkg.hasSkills,
  name: taskNames.deploySkills,
  /*
   * The root's own copy, for skills that can't move into a package: consumers
   * that read `<root>/skills/<name>/SKILL.md` never see a package's copy. Its
   * inputs need no `$TURBO_ROOT$` prefix (a root task already runs there) and
   * no package-glob subtraction the way `//#lint:eslint` does — both globs are
   * rooted, so neither can reach a package's `skills/`.
   */
  root: {
    appliesTo: discovery => discovery.root.hasSkills,
    task: graph => ({
      dependsOn: graph.appliesAtRoot(taskNames.lintEslint)
        ? [rootTaskKey(taskNames.lintEslint)]
        : [],
      inputs: [skillsConfigFilename, 'skills/**'],
      outputs: [],
    }),
  },
  task: graph => ({
    /*
     * Same-package lint only (no `^`): skills are authored independently
     * per package and don't depend on sibling packages' lint state.
     * Lint dep is conditional on the workspace having ESLint at all —
     * referencing `lint:eslint` when it isn't generated would dangle.
     */
    dependsOn: graph.applies(taskNames.lintEslint) ? [taskNames.lintEslint] : [],
    inputs: [`$TURBO_ROOT$/${skillsConfigFilename}`, 'skills/**'],
    outputs: [],
  }),
};

/**
 * Every leaf task gtb generates a script and a turbo task for.
 */
export const leaves: readonly Leaf[] = [
  typecheckTs,
  compileTs,
  compileSkills,
  packNpm,
  typecheckPkl,
  packPkl,
  lintEslint,
  ...testLeaves,
  deploySkills,
];
