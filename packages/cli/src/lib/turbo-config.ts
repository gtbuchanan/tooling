import {
  compileTs, coverageVitestMerge, lintEslint, lintOxlint,
  packNpm, testVitestE2e, testVitestFast, testVitestSlow,
  typecheckTs,
} from '../commands/leaf/index.ts';
import type { WorkspaceDiscovery } from './discovery.ts';

/** Turbo-only aggregate task names (no CLI handler). */
export const Aggregate = {
  build: 'build',
  buildCi: 'build:ci',
  check: 'check',
  compile: 'compile',
  coverageMerge: 'coverage:merge',
  generate: 'generate',
  lint: 'lint',
  pack: 'pack',
  testE2e: 'test:e2e',
  testSlow: 'test:slow',
  typecheck: 'typecheck',
} as const;

/** Turborepo task definition. */
export interface TurboTask {
  readonly dependsOn?: readonly string[];
  readonly env?: readonly string[];
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
}

/** Generated turbo.json structure. */
export interface TurboJson {
  readonly $schema: string;
  readonly tasks: Readonly<Record<string, TurboTask>>;
}

/** Conditional entry for building records from flags. */
export interface ConditionalEntry<Value> {
  readonly condition: boolean;
  readonly key: string;
  readonly value: Value;
}

/** Filters conditional entries and builds a record. */
export const collect = <Value>(
  entries: readonly ConditionalEntry<Value>[],
): Record<string, Value> =>
  Object.fromEntries(
    entries.filter(entry => entry.condition).map(entry => [entry.key, entry.value]),
  );

/** Flags summarizing which tool categories are active across all packages. */
export interface ToolFlags {
  readonly hasCheck: boolean;
  readonly hasE2e: boolean;
  readonly hasEslint: boolean;
  readonly hasGenerate: boolean;
  readonly generateScripts: readonly string[];
  readonly hasLint: boolean;
  readonly hasOxlint: boolean;
  readonly hasPublished: boolean;
  readonly hasTypeScript: boolean;
  readonly hasVitest: boolean;
}

/** @internal Exported for script generation. */
export const resolveToolFlags = (discovery: WorkspaceDiscovery): ToolFlags => {
  const hasEslint = discovery.packages.some(pkg => pkg.hasEslint);
  const hasOxlint = discovery.packages.some(pkg => pkg.hasOxlint);
  const hasLint = hasEslint || hasOxlint;
  const generateScripts = [...new Set(
    discovery.packages.flatMap(pkg => pkg.generateScripts),
  )].sort();
  const hasTypeScript = discovery.packages.some(pkg => pkg.hasTypeScript);
  const hasVitest = discovery.packages.some(pkg => pkg.hasVitestTests);

  return {
    generateScripts,
    hasCheck: hasTypeScript || hasLint || hasVitest,
    hasE2e: discovery.root.hasVitestE2e,
    hasEslint,
    hasGenerate: generateScripts.length > 0,
    hasLint,
    hasOxlint,
    hasPublished: discovery.packages.some(pkg => pkg.isPublished),
    hasTypeScript,
    hasVitest,
  };
};

/** Creates a topological (cross-package) task dependency. */
const topo = (task: string): string => `^${task}`;

const typecheckTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasTypeScript,
    key: typecheckTs.name,
    value: {
      dependsOn: [...(flags.hasGenerate ? [Aggregate.generate] : [])],
      inputs: [
        'bin/**', 'src/**', 'test/**', 'e2e/**', 'scripts/**',
        'tsconfig.json', 'tsconfig.*.json',
      ],
      outputs: [],
    },
  },
];

const typecheckAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasTypeScript,
    key: Aggregate.typecheck,
    value: { dependsOn: [typecheckTs.name] },
  },
];

const compileTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: compileTs.name,
    value: {
      dependsOn: [topo(compileTs.name), ...(flags.hasGenerate ? [Aggregate.generate] : [])],
      inputs: ['bin/**', 'src/**', 'scripts/**', 'tsconfig.json', 'tsconfig.*.json'],
      outputs: ['dist/source/**'],
    },
  },
];

const packTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: packNpm.name,
    value: {
      dependsOn: [compileTs.name],
      inputs: ['$TURBO_ROOT$/package.json', 'dist/source/**', 'package.json'],
      outputs: ['dist/packages/npm/**', 'dist/source/package.json'],
    },
  },
];

const lintTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = [
    ...(flags.hasGenerate ? [Aggregate.generate] : []),
    ...(flags.hasTypeScript ? [typecheckTs.name] : []),
  ];
  const inputs = ['bin/**', 'src/**', 'test/**', 'e2e/**', 'scripts/**'];

  return [
    {
      condition: flags.hasEslint,
      key: lintEslint.name,
      value: {
        dependsOn: deps,
        inputs: ['$TURBO_ROOT$/eslint.config.*', ...inputs, 'eslint.config.*'],
        outputs: ['dist/.eslintcache'],
      },
    },
    {
      condition: flags.hasOxlint,
      key: lintOxlint.name,
      value: { dependsOn: deps, inputs: [...inputs, 'oxlint.config.*'], outputs: [] },
    },
  ];
};

const testTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = [
    ...(flags.hasPublished ? [topo(compileTs.name)] : []),
  ];
  const testInputs = ['bin/**', 'src/**', 'test/**', 'scripts/**', 'vitest.config.*'];

  return [
    {
      condition: flags.hasVitest,
      key: testVitestFast.name,
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/fast/**', 'dist/test-results/vitest/merge/blob-fast.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: testVitestSlow.name,
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/slow/**', 'dist/test-results/vitest/merge/blob-slow.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: coverageVitestMerge.name,
      value: {
        dependsOn: [testVitestFast.name, testVitestSlow.name],
        inputs: ['dist/test-results/vitest/merge/blob-*.json'],
        outputs: ['dist/coverage/vitest/merged/**'],
      },
    },
    {
      condition: flags.hasE2e,
      key: testVitestE2e.name,
      value: {
        dependsOn: flags.hasPublished ? [Aggregate.pack, topo(Aggregate.pack)] : [],
        env: ['CI'],
        inputs: ['e2e/**', 'vitest.config.e2e.*'],
        outputs: [],
      },
    },
  ];
};

const generateAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasGenerate,
    key: Aggregate.generate,
    value: { dependsOn: [...flags.generateScripts] },
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

/** Generates turbo.json from workspace discovery. */
export const generateTurboJson = (discovery: WorkspaceDiscovery): TurboJson => {
  const flags = resolveToolFlags(discovery);
  const entries = [
    ...typecheckTasks(flags),
    ...compileTasks(flags),
    ...packTasks(flags),
    ...lintTasks(flags),
    ...testTasks(flags),
    ...generateAggregate(flags),
    ...typecheckAggregate(flags),
    ...compileAggregate(flags),
    ...packAggregate(flags),
    ...lintAggregate(flags),
    ...checkAggregate(flags),
    ...buildAggregates(flags),
  ];

  return { $schema: 'https://turbo.build/schema.json', tasks: collect(entries) };
};

export {
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from './turbo-scripts.ts';
