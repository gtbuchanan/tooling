import { taskNames } from '../commands/task/names.ts';
import type { WorkspaceDiscovery } from './discovery.ts';
import { skillsConfigFilename } from './skills-config.ts';
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
  readonly hasSkills: boolean;
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
    hasSkills: discovery.packages.some(pkg => pkg.hasSkills),
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
    key: taskNames.typecheckTs,
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
    key: taskNames.compileTs,
    value: {
      dependsOn: [topo(taskNames.compileTs), ...(flags.hasGenerate ? [Aggregate.generate] : [])],
      inputs: [
        '$TURBO_ROOT$/tsconfig.base.json', '$TURBO_ROOT$/tsconfig.build.json',
        ...flags.compileIncludes.flatMap(toTurboGlobs), 'tsconfig.build.json',
      ],
      outputs: ['dist/source/**'],
    },
  },
];

const compileSkillsTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasSkills && flags.hasPublished,
    key: taskNames.compileSkills,
    value: {
      inputs: ['skills/**'],
      outputs: ['dist/source/skills/**'],
    },
  },
];

const packTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: taskNames.packNpm,
    value: {
      dependsOn: [
        taskNames.compileTs,
        ...(flags.hasSkills ? [taskNames.compileSkills] : []),
      ],
      /*
       * Exclude the generated manifest from inputs: pack:npm writes
       * `dist/source/package.json` as one of its outputs, and including it
       * in the input glob makes the task's hash depend on whether a prior
       * run left the file on disk. That prevents cache hits across fresh
       * worktrees even when the source inputs are identical.
       */
      inputs: [
        '$TURBO_ROOT$/package.json',
        'dist/source/**', '!dist/source/package.json',
        'package.json',
      ],
      outputs: ['dist/packages/npm/**', 'dist/source/package.json'],
    },
  },
];

const lintTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = [
    ...(flags.hasGenerate ? [Aggregate.generate] : []),
    ...(flags.hasTypeScript ? [taskNames.typecheckTs] : []),
  ];
  const inputs = ['bin/**', 'src/**', 'test/**', 'e2e/**', 'scripts/**', 'skills/**'];

  return [
    {
      condition: flags.hasEslint,
      key: taskNames.lintEslint,
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
    ...(flags.hasPublished ? [topo(taskNames.compileTs)] : []),
  ];

  return [
    {
      condition: flags.hasVitest,
      key: taskNames.testVitestFast,
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/fast/**', 'dist/test-results/vitest/merge/blob-fast.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: taskNames.testVitestSlow,
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/slow/**', 'dist/test-results/vitest/merge/blob-slow.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: taskNames.coverageVitestMerge,
      value: {
        dependsOn: [taskNames.testVitestFast, taskNames.testVitestSlow],
        inputs: ['dist/test-results/vitest/merge/blob-*.json'],
        outputs: ['dist/coverage/vitest/merged/**'],
      },
    },
    {
      condition: flags.hasE2e,
      key: taskNames.testVitestE2e,
      value: {
        dependsOn: flags.hasPublished ? [Aggregate.pack, topo(Aggregate.pack)] : [],
        env: ['CI'],
        inputs: ['e2e/**', 'vitest.config.e2e.*'],
        outputs: ['dist/test-results/vitest/blob-e2e.json'],
      },
    },
  ];
};

const deploySkillsTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasSkills,
    key: taskNames.deploySkills,
    value: {
      /*
       * Same-package lint only (no `^`): skills are authored independently
       * per package and don't depend on sibling packages' lint state.
       * Lint dep is conditional on the workspace having ESLint at all —
       * referencing lint:eslint when it isn't generated would dangle.
       */
      dependsOn: flags.hasEslint ? [taskNames.lintEslint] : [],
      inputs: [`$TURBO_ROOT$/${skillsConfigFilename}`, 'skills/**'],
      outputs: [],
    },
  },
];

/** Generates turbo.json from workspace discovery. */
export const generateTurboJson = (discovery: WorkspaceDiscovery): TurboJson => {
  const flags = resolveToolFlags(discovery);
  const entries = [
    ...typecheckTasks(flags),
    ...compileTasks(flags),
    ...compileSkillsTasks(flags),
    ...packTasks(flags),
    ...lintTasks(flags),
    ...testTasks(flags),
    ...deploySkillsTasks(flags),
    ...aggregateTasks(flags),
  ];

  return { $schema: 'https://turbo.build/schema.json', tasks: collect(entries) };
};

export {
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from './turbo-scripts.ts';
