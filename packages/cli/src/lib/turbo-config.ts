import {
  compileTs, coverageVitestMerge, lintEslint,
  packNpm, testVitestE2e, testVitestFast, testVitestSlow,
  typecheckTs,
} from '../commands/leaf/index.ts';
import type { WorkspaceDiscovery } from './discovery.ts';
import { typeCheckInclude } from './tsconfig-gen.ts';
import { aggregateTasks } from './turbo-aggregates.ts';

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
  /** Union of tsconfig.build.json `include` directories across published packages. */
  readonly compileIncludes: readonly string[];
  readonly hasCheck: boolean;
  readonly hasE2e: boolean;
  readonly hasEslint: boolean;
  readonly hasGenerate: boolean;
  readonly generateScripts: readonly string[];
  readonly hasLint: boolean;
  readonly hasPublished: boolean;
  readonly hasTypeScript: boolean;
  readonly hasVitest: boolean;
}

/**
 * Exported for script generation.
 * @internal
 */
export const resolveToolFlags = (discovery: WorkspaceDiscovery): ToolFlags => {
  const hasEslint = discovery.packages.some(pkg => pkg.hasEslint);
  const hasLint = hasEslint;
  const generateScripts = [...new Set(
    discovery.packages.flatMap(pkg => pkg.generateScripts),
  )].toSorted();
  const hasTypeScript = discovery.packages.some(pkg => pkg.hasTypeScript);
  const hasVitest = discovery.packages.some(pkg => pkg.hasVitestTests);
  const compileIncludes = [...new Set(
    discovery.packages.filter(pkg => pkg.isPublished).flatMap(pkg => pkg.buildIncludes),
  )].toSorted();

  return {
    compileIncludes,
    generateScripts,
    hasCheck: hasTypeScript || hasLint || hasVitest,
    hasE2e: discovery.root.hasVitestE2e || discovery.packages.some(pkg => pkg.hasVitestE2e),
    hasEslint,
    hasGenerate: generateScripts.length > 0,
    hasLint,
    hasPublished: discovery.packages.some(pkg => pkg.isPublished),
    hasTypeScript,
    hasVitest,
  };
};

/** Creates a topological (cross-package) task dependency. */
const topo = (task: string): string => `^${task}`;

/** Script file extensions for turbo input globs. Sorted alphabetically. */
const scriptExts = ['cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx'] as const;

const isGlob = (pattern: string): boolean => /[*?\{]/v.test(pattern);

/**
 * Converts a tsconfig `include` entry to turbo input glob(s).
 * Directories become recursive (`src` → `src/**`).
 * Root-level globs (`*`, `.*`) expand to per-extension patterns
 * since turbo globs are extension-agnostic unlike tsconfig.
 */
const toTurboGlobs = (include: string): readonly string[] => {
  if (include === '*') return scriptExts.map(ext => `*.${ext}`);
  if (include === '.*') return scriptExts.map(ext => `.*.${ext}`);
  if (isGlob(include)) return [include];
  return [`${include}/**`];
};

const typecheckTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasTypeScript,
    key: typecheckTs.name,
    value: {
      dependsOn: [...(flags.hasGenerate ? [Aggregate.generate] : [])],
      inputs: [
        '$TURBO_ROOT$/tsconfig.base.json',
        ...typeCheckInclude.flatMap(toTurboGlobs),
        'tsconfig.json', 'tsconfig.*.json',
      ],
      outputs: [],
    },
  },
];

const compileTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: compileTs.name,
    value: {
      dependsOn: [topo(compileTs.name), ...(flags.hasGenerate ? [Aggregate.generate] : [])],
      inputs: [
        '$TURBO_ROOT$/tsconfig.base.json', '$TURBO_ROOT$/tsconfig.build.json',
        ...flags.compileIncludes.flatMap(toTurboGlobs), 'tsconfig.build.json',
      ],
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
  ];
};

/*
 * Unlike compile inputs, test inputs can't be resolved from vitest config —
 * vitest configs are executable TypeScript, not statically parseable.
 * Broadening beyond test directories is intentional: tests import source.
 */
const testInputs = [
  'bin/**', 'src/**', 'test/**', 'scripts/**',
  'vitest.config.*', '!vitest.config.e2e.*',
];

const testTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = [
    ...(flags.hasPublished ? [topo(compileTs.name)] : []),
  ];

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
        outputs: ['dist/test-results/vitest/blob-e2e.json'],
      },
    },
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
    ...aggregateTasks(flags),
  ];

  return { $schema: 'https://turbo.build/schema.json', tasks: collect(entries) };
};

export {
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from './turbo-scripts.ts';
