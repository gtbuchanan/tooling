import { taskNames } from '../commands/task/names.ts';
import {
  Aggregate,
  type ConditionalEntry,
  type ToolFlags,
  type TurboTask,
} from './turbo-config.ts';

const generateAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasGenerate,
    key: Aggregate.generate,
    value: { dependsOn: [...flags.generateScripts] },
  },
];

const typecheckAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasTypeScript,
    key: Aggregate.typecheck,
    value: { dependsOn: [taskNames.typecheckTs] },
  },
];

const compileAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: Aggregate.compile,
    value: { dependsOn: [taskNames.compileTs] },
  },
];

const packAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: Aggregate.pack,
    value: { dependsOn: [taskNames.packNpm] },
  },
];

const lintAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasLint,
    key: Aggregate.lint,
    value: {
      dependsOn: [
        ...(flags.hasEslint ? [taskNames.lintEslint] : []),
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
        ...(flags.hasTypeScript ? [Aggregate.typecheck] : []),
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
    ...(flags.hasPublished ? [Aggregate.compile, Aggregate.pack] : []),
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

/** Collects aggregate and standalone task entries from tool flags. */
export const aggregateTasks = (
  flags: ToolFlags,
): readonly ConditionalEntry<TurboTask>[] => [
  ...coverageTasks(flags),
  ...generateAggregate(flags),
  ...typecheckAggregate(flags),
  ...compileAggregate(flags),
  ...packAggregate(flags),
  ...lintAggregate(flags),
  ...checkAggregate(flags),
  ...buildAggregates(flags),
];
