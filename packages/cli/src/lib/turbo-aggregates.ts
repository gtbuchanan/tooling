import { taskNames } from '../commands/task/names.ts';
import {
  Aggregate,
  type ConditionalEntry,
  type ToolFlags,
  type TurboTask,
  rootTaskKey,
  topo,
} from './turbo-config.ts';

/*
 * `generate:*` scripts are author-owned codegen. Discovery finds the names,
 * but nothing in the manifest says what a script writes, so gtb cannot
 * declare `outputs` for one — and an outputs-less task caches logs only, so a
 * cache hit replays them, skips the run, and restores nothing. The generated
 * files then never appear and every downstream task happily reads whatever is
 * on disk (or nothing).
 *
 * Monorepos therefore push the leaves down to the packages, using the seam
 * turbo provides for exactly this: the root aggregate stays empty and each
 * package declares `generate` plus its own leaves — with real inputs and
 * outputs — in a package configuration (`packages/<pkg>/turbo.json` extending
 * `//`). Only the package knows what its codegen emits. A package that skips
 * the wiring silently never generates, so `gtb verify` asserts it (see
 * `checkGenerateConfigs`).
 *
 * Single-package repos get no such seam — turbo supports package
 * configurations only for workspace packages, and the lone turbo.json is
 * sync-owned — so the leaves are declared here and opted out of caching.
 * Uncached codegen always runs, which is slower than a cache hit but never
 * silently absent.
 */
const generateLeafTasks = (
  flags: ToolFlags,
  isMonorepo: boolean,
): readonly ConditionalEntry<TurboTask>[] => {
  if (isMonorepo) {
    return [];
  }

  return flags.generateScripts.map(script => ({
    condition: true,
    key: script,
    value: { cache: false },
  }));
};

const generateAggregate = (
  flags: ToolFlags,
  isMonorepo: boolean,
): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasGenerate,
    key: Aggregate.generate,
    value: isMonorepo ? {} : { dependsOn: [...flags.generateScripts] },
  },
  ...generateLeafTasks(flags, isMonorepo),
];

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
 * Emitted only when something references it, so a workspace with none of the
 * three toolchains doesn't carry a dangling node.
 */
const transitNode = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasEslint || flags.hasTypeScript || flags.hasVitest,
    key: Aggregate.transit,
    value: { dependsOn: [topo(Aggregate.transit)] },
  },
];

const typecheckAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasTypeScript || flags.hasPkl,
    key: Aggregate.typecheck,
    value: {
      dependsOn: [
        ...(flags.hasTypeScript ? [taskNames.typecheckTs] : []),
        ...(flags.hasPkl ? [taskNames.typecheckPkl] : []),
      ],
    },
  },
];

const compileAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: Aggregate.compile,
    value: {
      dependsOn: [
        taskNames.compileTs,
        ...(flags.hasSkills ? [taskNames.compileSkills] : []),
      ],
    },
  },
];

const packAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPackable,
    key: Aggregate.pack,
    value: {
      dependsOn: [
        ...(flags.hasPublished ? [taskNames.packNpm] : []),
        ...(flags.hasPklPackage ? [taskNames.packPkl] : []),
      ],
    },
  },
];

const lintAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  /*
   * Root tasks must be referenced explicitly — turbo does not roll them
   * into the bare task name when resolving deps.
   */
  {
    condition: flags.hasLint,
    key: Aggregate.lint,
    value: {
      dependsOn: [
        ...(flags.hasEslint ? [taskNames.lintEslint] : []),
        ...(flags.hasRootEslint ? [rootTaskKey(taskNames.lintEslint)] : []),
      ],
    },
  },
];

const checkAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasCheck,
    key: Aggregate.check,
    value: {
      dependsOn: [
        ...(flags.hasTypeScript || flags.hasPkl ? [Aggregate.typecheck] : []),
        ...(flags.hasLint ? [Aggregate.lint] : []),
        ...(flags.hasVitest ? [taskNames.testVitestFast] : []),
      ],
    },
  },
];

const buildAggregates = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const testAggregates: readonly ConditionalEntry<TurboTask>[] = [
    {
      condition: flags.hasVitest,
      key: Aggregate.testSlow,
      value: { dependsOn: [taskNames.testVitestSlow] },
    },
    {
      condition: flags.hasE2e,
      key: Aggregate.testE2e,
      value: { dependsOn: [taskNames.testVitestE2e] },
    },
    {
      condition: flags.hasVitest,
      key: Aggregate.coverageMerge,
      value: { dependsOn: [taskNames.coverageVitestMerge] },
    },
  ];
  const ciDeps = [
    ...(flags.hasCheck ? [Aggregate.check] : []),
    ...(flags.hasPublished ? [Aggregate.compile] : []),
    ...(flags.hasPackable ? [Aggregate.pack] : []),
  ];
  const fullDeps = [
    ...ciDeps,
    ...(flags.hasVitest ? [Aggregate.testSlow] : []),
    ...(flags.hasE2e ? [Aggregate.testE2e] : []),
    ...(flags.hasSkills ? [taskNames.deploySkills] : []),
  ];

  return [
    ...testAggregates,
    { condition: ciDeps.length > 0, key: Aggregate.buildCi, value: { dependsOn: ciDeps } },
    { condition: fullDeps.length > 0, key: Aggregate.build, value: { dependsOn: fullDeps } },
  ];
};

// No dependsOn — CI downloads coverage artifacts before running.
// Turbo caches based on lcov content, not task deps.
const coverageTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasVitest,
    key: taskNames.coverageCodecovUpload,
    value: {
      env: ['CI', 'CODECOV_TOKEN'],
      inputs: ['dist/coverage/vitest/**/lcov.info'],
      outputs: ['dist/coverage/codecov/.uploaded'],
    },
  },
];

/**
 * Collects aggregate and standalone task entries from tool flags.
 * `isMonorepo` is passed separately: it describes the repo's shape rather
 * than a tool being present, and only the `generate` family reads it.
 */
export const aggregateTasks = (
  flags: ToolFlags,
  isMonorepo: boolean,
): readonly ConditionalEntry<TurboTask>[] => [
  ...coverageTasks(flags),
  ...generateAggregate(flags, isMonorepo),
  ...transitNode(flags),
  ...typecheckAggregate(flags),
  ...compileAggregate(flags),
  ...packAggregate(flags),
  ...lintAggregate(flags),
  ...checkAggregate(flags),
  ...buildAggregates(flags),
];
