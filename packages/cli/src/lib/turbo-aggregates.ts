import {
  compileTs, coverageCodecovUpload, coverageVitestMerge, lintEslint,
  lintOxlint, packNpm, testVitestE2e, testVitestFast, testVitestSlow,
  typecheckTs,
} from '../commands/leaf/index.ts';
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
    value: { dependsOn: [typecheckTs.name] },
  },
];

const compileAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: Aggregate.compile,
    value: { dependsOn: [compileTs.name] },
  },
];

const packAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: Aggregate.pack,
    value: { dependsOn: [packNpm.name] },
  },
];

const lintAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasLint,
    key: Aggregate.lint,
    value: {
      dependsOn: [
        ...(flags.hasEslint ? [lintEslint.name] : []),
        ...(flags.hasOxlint ? [lintOxlint.name] : []),
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
        ...(flags.hasVitest ? [testVitestFast.name] : []),
      ],
    },
  },
];

const buildAggregates = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const testAggregates: readonly ConditionalEntry<TurboTask>[] = [
    {
      condition: flags.hasVitest,
      key: Aggregate.testSlow,
      value: { dependsOn: [testVitestSlow.name] },
    },
    {
      condition: flags.hasE2e,
      key: Aggregate.testE2e,
      value: { dependsOn: [testVitestE2e.name] },
    },
    {
      condition: flags.hasVitest,
      key: Aggregate.coverageMerge,
      value: { dependsOn: [coverageVitestMerge.name] },
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
    key: coverageCodecovUpload.name,
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
