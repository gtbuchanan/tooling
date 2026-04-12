import type { WorkspaceDiscovery } from './discovery.ts';

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

const typecheckTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasTypeScript,
    key: 'typecheck:ts',
    value: {
      dependsOn: [...(flags.hasGenerate ? ['generate'] : [])],
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
    key: 'typecheck',
    value: { dependsOn: ['typecheck:ts'] },
  },
];

const compileTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: 'compile:ts',
    value: {
      dependsOn: ['^compile:ts', ...(flags.hasGenerate ? ['generate'] : [])],
      inputs: ['bin/**', 'src/**', 'scripts/**', 'tsconfig.json', 'tsconfig.*.json'],
      outputs: ['dist/source/**'],
    },
  },
];

const packTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: 'pack:npm',
    value: {
      dependsOn: ['compile:ts'],
      inputs: ['$TURBO_ROOT$/package.json', 'dist/source/**', 'package.json'],
      outputs: ['dist/packages/npm/**', 'dist/source/package.json'],
    },
  },
];

const lintTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = [
    ...(flags.hasGenerate ? ['generate'] : []),
    ...(flags.hasTypeScript ? ['typecheck:ts'] : []),
  ];
  const inputs = ['bin/**', 'src/**', 'test/**', 'e2e/**', 'scripts/**'];

  return [
    {
      condition: flags.hasEslint,
      key: 'lint:eslint',
      value: {
        dependsOn: deps,
        inputs: ['$TURBO_ROOT$/eslint.config.*', ...inputs, 'eslint.config.*'],
        outputs: ['dist/.eslintcache'],
      },
    },
    {
      condition: flags.hasOxlint,
      key: 'lint:oxlint',
      value: { dependsOn: deps, inputs: [...inputs, 'oxlint.config.*'], outputs: [] },
    },
  ];
};

const testTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = [
    ...(flags.hasPublished ? ['^compile:ts'] : []),
  ];
  const testInputs = ['bin/**', 'src/**', 'test/**', 'scripts/**', 'vitest.config.*'];

  return [
    {
      condition: flags.hasVitest,
      key: 'test:vitest:fast',
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/fast/**', 'dist/test-results/vitest/merge/blob-fast.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: 'test:vitest:slow',
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/slow/**', 'dist/test-results/vitest/merge/blob-slow.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: 'coverage:vitest:merge',
      value: {
        dependsOn: ['test:vitest:fast', 'test:vitest:slow'],
        inputs: ['dist/test-results/vitest/merge/blob-*.json'],
        outputs: ['dist/coverage/vitest/merged/**'],
      },
    },
    {
      condition: flags.hasE2e,
      key: 'test:vitest:e2e',
      value: {
        dependsOn: flags.hasPublished ? ['pack', '^pack'] : [],
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
    key: 'generate',
    value: { dependsOn: [...flags.generateScripts] },
  },
];

const compileAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: 'compile',
    value: { dependsOn: ['compile:ts'] },
  },
];

const packAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: 'pack',
    value: { dependsOn: ['pack:npm'] },
  },
];

const lintAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasLint,
    key: 'lint',
    value: {
      dependsOn: [
        ...(flags.hasEslint ? ['lint:eslint'] : []),
        ...(flags.hasOxlint ? ['lint:oxlint'] : []),
      ],
    },
  },
];

const checkAggregate = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasCheck,
    key: 'check',
    value: {
      dependsOn: [
        ...(flags.hasTypeScript ? ['typecheck'] : []),
        ...(flags.hasLint ? ['lint'] : []),
        ...(flags.hasVitest ? ['test:vitest:fast'] : []),
      ],
    },
  },
];

const buildAggregates = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const testAggregates: readonly ConditionalEntry<TurboTask>[] = [
    { condition: flags.hasVitest, key: 'test:slow', value: { dependsOn: ['test:vitest:slow'] } },
    { condition: flags.hasE2e, key: 'test:e2e', value: { dependsOn: ['test:vitest:e2e'] } },
    {
      condition: flags.hasVitest,
      key: 'coverage:merge',
      value: { dependsOn: ['coverage:vitest:merge'] },
    },
  ];
  const ciDeps = [
    ...(flags.hasCheck ? ['check'] : []),
    ...(flags.hasPublished ? ['compile', 'pack'] : []),
  ];
  const fullDeps = [
    ...ciDeps,
    ...(flags.hasVitest ? ['test:slow'] : []),
    ...(flags.hasE2e ? ['test:e2e'] : []),
  ];

  return [
    ...testAggregates,
    { condition: ciDeps.length > 0, key: 'build:ci', value: { dependsOn: ciDeps } },
    { condition: fullDeps.length > 0, key: 'build', value: { dependsOn: fullDeps } },
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

export { generatePackageScripts, generateRootScripts } from './turbo-scripts.ts';
