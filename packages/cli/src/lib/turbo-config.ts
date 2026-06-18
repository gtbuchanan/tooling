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
  /** Files hashed into every task. Emitted only when discovery detects them. */
  readonly globalDependencies?: readonly string[];
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
  /**
   * Some package produces a release artifact to pack — an npm-published
   * package or a Pkl package. The union a future kind (.NET, etc.) extends.
   */
  readonly hasPackable: boolean;
  /** Some package has Pkl source (drives `typecheck:pkl`). */
  readonly hasPkl: boolean;
  /** Some package is a publishable Pkl package (drives `pack:pkl`, publish). */
  readonly hasPklPackage: boolean;
  readonly hasPublished: boolean;
  /**
   * Workspace root has its own ESLint config and is a monorepo (so root
   * is distinct from any package). Single-package repos lint root files
   * via the per-package task and don't need a separate root task.
   */
  readonly hasRootEslint: boolean;
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
  )].toSorted((left, right) => left.localeCompare(right));
  const hasTypeScript = discovery.packages.some(pkg => pkg.hasTypeScript);
  const hasPkl = discovery.packages.some(pkg => pkg.hasPkl);
  const hasPklPackage = discovery.packages.some(pkg => pkg.hasPklPackage);
  const hasPublished = discovery.packages.some(pkg => pkg.isPublished);
  const hasVitest = discovery.packages.some(pkg => pkg.hasVitestTests);
  const compileIncludes = [...new Set(
    discovery.packages.flatMap(pkg => (pkg.isPublished ? pkg.buildIncludes : [])),
  )].toSorted((left, right) => left.localeCompare(right));

  return {
    compileIncludes,
    generateScripts,
    hasCheck: hasTypeScript || hasLint || hasVitest || hasPkl,
    hasE2e: discovery.root.hasVitestE2e || discovery.packages.some(pkg => pkg.hasVitestE2e),
    hasEslint,
    hasGenerate: generateScripts.length > 0,
    hasLint,
    hasPackable: hasPublished || hasPklPackage,
    hasPkl,
    hasPklPackage,
    hasPublished,
    hasRootEslint: discovery.isMonorepo && discovery.root.hasEslint,
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
       * pack:npm copies the package README and the package-or-root LICENSE
       * into dist/source so the published tarball ships them, and writes
       * dist/source/package.json. Those self-generated files are excluded
       * from the dist/source input glob — like the manifest, an input whose
       * presence depends on a prior run salts the hash and prevents cache
       * hits across fresh worktrees. Their sources (the root LICENSE and
       * per-package README/LICENSE) are inputs so an edit invalidates the
       * cache, and the copies are outputs so a cache-hit publish restores
       * them.
       */
      inputs: [
        '$TURBO_ROOT$/LICENSE',
        '$TURBO_ROOT$/package.json',
        'LICENSE', 'README.md',
        'dist/source/**',
        '!dist/source/LICENSE', '!dist/source/README.md', '!dist/source/package.json',
        'package.json',
      ],
      outputs: [
        'dist/packages/npm/**',
        'dist/source/LICENSE', 'dist/source/README.md', 'dist/source/package.json',
      ],
    },
  },
];

/*
 * Pkl package tasks. `typecheck:pkl` evaluates the modules to validate them
 * (`pkl eval` renders to stdout, which the handler discards — pure
 * validation, hence no outputs, mirroring `typecheck:ts`). `pack:pkl` is the
 * sole artifact-producing step (`pkl project package` → the release zip),
 * mirroring `pack:npm`. There is no `compile:pkl`: nothing consumes a rendered
 * intermediate — consumers import the source `.pkl` shipped inside the zip.
 */
const pklInputs = ['*.pkl', 'PklProject'];

const pklTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPkl,
    key: taskNames.typecheckPkl,
    value: { inputs: pklInputs, outputs: [] },
  },
  {
    condition: flags.hasPklPackage,
    key: taskNames.packPkl,
    value: {
      dependsOn: [taskNames.typecheckPkl],
      inputs: [...pklInputs, 'package.json'],
      outputs: ['dist/packages/pkl/**'],
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

/**
 * Converts a pnpm workspace package glob into an ESLint/turbo ignore
 * pattern that matches files under any directory the glob resolves to.
 * `packages/*` → `packages/*​/**` (descendants of any direct subdir).
 */
export const toPackageIgnore = (glob: string): string => `${glob}/**`;

/** Turbo task key for tasks dispatched at the workspace root. */
export const rootTaskKey = (name: string): string => `//#${name}`;

const rootLintTasks = (
  flags: ToolFlags,
  packageGlobs: readonly string[],
): readonly ConditionalEntry<TurboTask>[] => [
  /*
   * `$TURBO_DEFAULT$` expands to root files minus gitignored paths
   * (dist/, node_modules/, .turbo/, .claude/worktrees/); only package
   * dirs need explicit subtraction since they're tracked but owned by
   * per-package lint. Cache file lives in the root cwd's dist/,
   * distinct from per-package caches that live in each package's dist/.
   */
  {
    condition: flags.hasRootEslint,
    key: rootTaskKey(taskNames.lintEslint),
    value: {
      inputs: [
        '$TURBO_DEFAULT$',
        ...packageGlobs.map(glob => `!${toPackageIgnore(glob)}`),
      ],
      outputs: ['dist/.eslintcache'],
    },
  },
];

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
       * referencing lint:ESLint when it isn't generated would dangle.
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
    ...pklTasks(flags),
    ...lintTasks(flags),
    ...rootLintTasks(flags, discovery.packageGlobs),
    ...testTasks(flags),
    ...deploySkillsTasks(flags),
    ...aggregateTasks(flags),
  ];

  return {
    $schema: 'https://turbo.build/schema.json',
    ...(discovery.hasMise && { globalDependencies: ['mise.lock', 'mise.toml'] }),
    tasks: collect(entries),
  };
};

export {
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from './turbo-scripts.ts';
