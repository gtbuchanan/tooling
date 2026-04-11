import { relative } from 'node:path';
import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';

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
interface ConditionalEntry<Value> {
  readonly condition: boolean;
  readonly key: string;
  readonly value: Value;
}

/** Filters conditional entries and builds a record. */
const collect = <Value>(
  entries: readonly ConditionalEntry<Value>[],
): Record<string, Value> =>
  Object.fromEntries(
    entries.filter(entry => entry.condition).map(entry => [entry.key, entry.value]),
  );

/** Flags summarizing which tool categories are active across all packages. */
interface ToolFlags {
  readonly hasCheck: boolean;
  readonly hasE2e: boolean;
  readonly hasEslint: boolean;
  readonly hasLint: boolean;
  readonly hasOxlint: boolean;
  readonly hasPublished: boolean;
  readonly hasTypeScript: boolean;
  readonly hasVitest: boolean;
}

const resolveToolFlags = (discovery: WorkspaceDiscovery): ToolFlags => {
  const hasEslint = discovery.packages.some(pkg => pkg.hasEslint);
  const hasOxlint = discovery.packages.some(pkg => pkg.hasOxlint);
  const hasLint = hasEslint || hasOxlint;
  const hasVitest = discovery.packages.some(pkg => pkg.hasVitestTests);

  return {
    hasCheck: hasLint || hasVitest,
    hasE2e: discovery.root.hasVitestE2e,
    hasEslint,
    hasLint,
    hasOxlint,
    hasPublished: discovery.packages.some(pkg => pkg.isPublished),
    hasTypeScript: discovery.packages.some(pkg => pkg.hasTypeScript),
    hasVitest,
  };
};

const typecheckTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasTypeScript,
    key: 'typecheck:ts',
    value: {
      inputs: [
        'bin/**', 'src/**', 'test/**', 'e2e/**', 'scripts/**',
        'tsconfig.json', 'tsconfig.*.json',
      ],
      outputs: [],
    },
  },
];

const compileTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => [
  {
    condition: flags.hasPublished,
    key: 'compile:ts',
    value: {
      dependsOn: ['^compile:ts'],
      inputs: ['bin/**', 'src/**', 'tsconfig.json', 'tsconfig.*.json'],
      outputs: ['dist/source/**'],
    },
  },
  {
    condition: flags.hasPublished,
    key: '//#pack',
    value: {
      dependsOn: ['compile:ts'],
      inputs: ['packages/*/dist/source/**', 'packages/*/package.json'],
      outputs: ['dist/packages/**', 'packages/*/dist/source/package.json'],
    },
  },
];

const lintTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = flags.hasTypeScript ? ['typecheck:ts'] : [];
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
    ...(flags.hasTypeScript ? ['typecheck:ts'] : []),
    ...(flags.hasPublished ? ['^compile:ts'] : []),
  ];
  const shared: TurboTask = {
    dependsOn: deps,
    env: ['CI'],
    inputs: ['bin/**', 'src/**', 'test/**', 'scripts/**', 'vitest.config.*'],
    outputs: ['dist/coverage/**', 'dist/vitest-blob/**'],
  };

  return [
    { condition: flags.hasVitest, key: 'test:vitest:fast', value: shared },
    { condition: flags.hasVitest, key: 'test:vitest:slow', value: shared },
    {
      condition: flags.hasE2e,
      key: 'test:vitest:e2e',
      value: {
        dependsOn: flags.hasPublished ? ['//#pack'] : [],
        env: ['CI'],
        inputs: ['e2e/**', 'vitest.config.e2e.*'],
        outputs: [],
      },
    },
  ];
};

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
        ...(flags.hasLint ? ['lint'] : []),
        ...(flags.hasVitest ? ['test:vitest:fast'] : []),
      ],
    },
  },
];

const buildAggregates = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const ciDeps = [
    ...(flags.hasCheck ? ['check'] : []),
    ...(flags.hasPublished ? ['compile:ts', '//#pack'] : []),
  ];
  const fullDeps = [
    ...ciDeps,
    ...(flags.hasVitest ? ['test:vitest:slow'] : []),
    ...(flags.hasE2e ? ['test:vitest:e2e'] : []),
  ];

  return [
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
    ...lintTasks(flags),
    ...testTasks(flags),
    ...lintAggregate(flags),
    ...checkAggregate(flags),
    ...buildAggregates(flags),
  ];

  return { $schema: 'https://turbo.build/schema.json', tasks: collect(entries) };
};

const packageScriptEntries = (
  caps: PackageCapabilities,
): readonly ConditionalEntry<string>[] => {
  const cmd = (name: string): string => `gtb ${name}`;

  return [
    { condition: caps.hasTypeScript, key: 'typecheck:ts', value: cmd('typecheck:ts') },
    { condition: caps.isPublished, key: 'compile:ts', value: cmd('compile:ts') },
    { condition: caps.hasEslint, key: 'lint:eslint', value: cmd('lint:eslint') },
    { condition: caps.hasOxlint, key: 'lint:oxlint', value: cmd('lint:oxlint') },
    {
      condition: caps.hasVitestTests,
      key: 'test:vitest:fast',
      value: cmd('test:vitest:fast'),
    },
    {
      condition: caps.hasVitestTests,
      key: 'test:vitest:slow',
      value: cmd('test:vitest:slow'),
    },
  ];
};

/** Generates the gtb shim script for self-hosted packages. */
const gtbShim = (pkgDir: string, rootDir: string): string => {
  const rel = relative(pkgDir, rootDir).replaceAll('\\', '/');

  return `node --experimental-strip-types ${rel}/packages/cli/bin/gtb.ts`;
};

/** Generates per-package scripts from capabilities. */
export const generatePackageScripts = (
  caps: PackageCapabilities,
  isSelfHosted: boolean,
  rootDir?: string,
): Record<string, string> => {
  const scripts = collect(packageScriptEntries(caps));
  if (isSelfHosted && rootDir !== undefined) {
    scripts['gtb'] = gtbShim(caps.dir, rootDir);
  }

  return scripts;
};

const rootScriptEntries = (flags: ToolFlags): readonly ConditionalEntry<string>[] => [
  { condition: flags.hasCheck, key: 'check', value: 'turbo run check' },
  { condition: flags.hasCheck || flags.hasPublished, key: 'build:ci', value: 'turbo run build:ci' },
  {
    condition: flags.hasCheck || flags.hasPublished || flags.hasE2e,
    key: 'build',
    value: 'turbo run build',
  },
  { condition: flags.hasPublished, key: 'pack', value: 'gtb pack' },
  { condition: flags.hasE2e, key: 'test:e2e', value: 'gtb test:vitest:e2e' },
  { condition: true, key: 'prepare', value: 'gtb prepare' },
];

/** Generates root-level convenience scripts. */
export const generateRootScripts = (
  discovery: WorkspaceDiscovery,
): Record<string, string> => collect(rootScriptEntries(resolveToolFlags(discovery)));
