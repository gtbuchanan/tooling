import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { findUpSync } from 'find-up-simple';
import {
  type TestTagDefinition,
  type UserWorkspaceConfig,
  type ViteUserConfig,
  defaultExclude,
  defineConfig,
  mergeConfig,
} from 'vitest/config';

/** Shared options for all Vitest configuration layers. */
export interface VitestConfigureOptions {
  /**
   * Include `console-fail-test` setup file.
   * @defaultValue true
   */
  readonly consoleFailTest?: boolean;
  /**
   * Directories to include in coverage.
   * @defaultValue ['bin', 'scripts', 'src']
   */
  readonly coverageDirs?: readonly string[];
  /**
   * Include `hasAssertions` setup file.
   * @defaultValue true
   */
  readonly hasAssertions?: boolean;
}

/**
 * Options for the `slow` test tag. Accepts any {@link TestTagDefinition}
 * property except `name` (always `'slow'`). Timeout defaults to 300s.
 */
export type VitestSlowTagOptions = Partial<Omit<TestTagDefinition, 'name'>>;

/** Options for global Vitest configuration ({@link configureGlobal}). */
export interface VitestConfigureGlobalOptions extends VitestConfigureOptions {
  /** Glob patterns for auto-discovering project directories. */
  readonly projects?: readonly string[];
  /**
   * Configuration for the `slow` test tag. Tests tagged `slow` get an
   * extended timeout. Filter at runtime with `--tags-filter`.
   * @defaultValue {}
   */
  readonly slow?: VitestSlowTagOptions;
  /**
   * Additional test tags. Merged with the built-in `slow` tag.
   * Use `--tags-filter` to select tests by tag at runtime.
   */
  readonly tags?: readonly TestTagDefinition[];
}

/** Default test exclude patterns, extending Vitest's built-in excludes. */
export const excludeDefault = [
  ...defaultExclude,
  '.claude/worktrees/**',
  '**/dist/**',
] as const;

const packageName = '@gtbuchanan/vitest-config';

const coverageExtensions = '*.{cjs,cts,js,mjs,mts,ts,tsx}';

/** Default directories included in coverage reports. */
export const defaultCoverageDirs = [
  'bin',
  'scripts',
  'src',
] as const;

/** Default coverage include globs derived from {@link defaultCoverageDirs}. */
export const coverageInclude = defaultCoverageDirs.map(
  dir => `${dir}/**/${coverageExtensions}`,
);

/**
 * Builds coverage include globs, scoping to project patterns when provided.
 * @param projectPatterns - When set, generates both per-project and root-level patterns.
 * @param dirs - Directories to include. Defaults to {@link defaultCoverageDirs}.
 */
export const resolveCoverageInclude = (
  projectPatterns?: readonly string[],
  dirs: readonly string[] = defaultCoverageDirs,
): readonly string[] => {
  const patterns = dirs.map(
    dir => `${dir}/**/${coverageExtensions}`,
  );
  if (projectPatterns === undefined) {
    return patterns;
  }
  return [
    ...projectPatterns.flatMap(project =>
      patterns.map(pattern => `${project}/${pattern}`),
    ),
    ...patterns,
  ];
};

/** Resolves the list of Vitest setup files based on feature flags. */
export const resolveSetupFiles = (options: VitestConfigureOptions): string[] => {
  const { consoleFailTest = true, hasAssertions = true } = options;
  const setupFiles: string[] = [];
  if (consoleFailTest) {
    setupFiles.push(`${packageName}/console-fail-test`);
  }
  if (hasAssertions) {
    setupFiles.push(`${packageName}/setup`);
  }
  return setupFiles;
};

const configExtensions = ['.ts', '.js', '.mts', '.mjs'] as const;

/**
 * Finds a config file by prefix in a directory.
 * Checks common extensions (.ts, .js, .mts, .mjs) and returns the first match.
 */
export const findConfigFile = (dir: string, prefix: string): string | undefined => {
  for (const ext of configExtensions) {
    const filePath = path.join(dir, `${prefix}${ext}`);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return undefined;
};

const hasVitestConfig = (dir: string): boolean =>
  findConfigFile(dir, 'vitest.config') !== undefined;

const globSuffix = '/*';
const findGitRoot = (cwd: string): string | undefined => {
  const gitPath = findUpSync('.git', { cwd });
  return gitPath === undefined ? undefined : path.dirname(gitPath);
};

const resolveCoverageProjectRoot = (cwd: string): string => {
  const githubWorkspace = process.env['GITHUB_WORKSPACE'];
  if (githubWorkspace !== undefined && githubWorkspace !== '') {
    return githubWorkspace;
  }
  return findGitRoot(cwd) ?? cwd;
};

/**
 * Resolves glob patterns (e.g. `['packages/*']`) to absolute directory paths.
 * Patterns ending in `/*` are expanded; others are resolved as-is.
 */
export const resolveProjectDirs = (
  patterns: readonly string[],
): string[] =>
  patterns.flatMap((pattern) => {
    if (pattern.endsWith(globSuffix)) {
      const parent = path.resolve(
        process.cwd(),
        pattern.slice(0, -globSuffix.length),
      );
      return readdirSync(parent, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(parent, entry.name));
    }
    return [path.resolve(process.cwd(), pattern)];
  });

/**
 * Builds an inline project entry from a directory and project config factory.
 * Adds `test.name` (from directory basename) and `test.root` to the config
 * produced by the factory.
 */
export const buildWorkspaceEntry = (
  dir: string,
  configureFn: () => UserWorkspaceConfig,
): UserWorkspaceConfig => {
  const config = configureFn();
  return {
    ...config,
    test: {
      ...config.test,
      name: path.basename(dir),
      root: dir,
    },
  };
};

const buildProjectEntry = (
  dir: string,
  configureFn: () => UserWorkspaceConfig,
): string | UserWorkspaceConfig => {
  if (hasVitestConfig(dir)) {
    return dir;
  }
  return buildWorkspaceEntry(dir, configureFn);
};

const resolveProjects = (
  patterns: readonly string[],
  configureFn: () => UserWorkspaceConfig,
): (string | UserWorkspaceConfig)[] =>
  resolveProjectDirs(patterns).map(dir =>
    buildProjectEntry(dir, configureFn),
  );

/**
 * Builds per-project Vitest settings: test includes and default excludes.
 * Use Node.js subpath imports (`#src/*`, `#test/*`) for path aliases.
 */
export const buildProjectConfig = (
  include: readonly string[],
): UserWorkspaceConfig => ({
  test: {
    exclude: [...excludeDefault],
    include: [...include],
  },
});

interface GlobalConfigSpec {
  readonly coverageInclude?: readonly string[];
  readonly reportsDirectory?: string;
  readonly tags?: readonly TestTagDefinition[];
  readonly testTimeout?: number;
}

/**
 * Builds global Vitest settings: coverage, setupFiles, mockReset, unstubEnvs,
 * tags, and optional projects list.
 */
export const buildGlobalConfig = (
  spec: GlobalConfigSpec,
  setupOptions: VitestConfigureOptions,
  resolvedProjects?: readonly (string | UserWorkspaceConfig)[],
): ViteUserConfig =>
  defineConfig({
    test: {
      ...(spec.reportsDirectory && {
        coverage: {
          cleanOnRerun: false,
          enabled: true,
          exclude: [...excludeDefault],
          include: [...(spec.coverageInclude ?? coverageInclude)],
          provider: 'v8',
          // Emit repo-relative SF paths so Codecov maps coverage across packages
          reporter: [['lcov', { projectRoot: resolveCoverageProjectRoot(process.cwd()) }]],
          reportsDirectory: path.join(
            process.cwd(),
            spec.reportsDirectory,
          ),
        },
      }),
      mockReset: true,
      outputFile: { blob: 'dist/test-results/vitest/blob-all.json' },
      reporters: ['default', 'blob'],
      setupFiles: resolveSetupFiles(setupOptions),
      ...(spec.tags && { tags: [...spec.tags] }),
      ...(spec.testTimeout && {
        testTimeout: spec.testTimeout,
      }),
      unstubEnvs: true,
      ...(resolvedProjects && {
        projects: [...resolvedProjects],
      }),
    },
  });

const unitTestInclude = ['test/**/*.test.ts'] as const;

const defaultSlowTimeout = 300_000;

/**
 * Per-project configuration for use with vitest projects.
 * Sets excludes. Does not include global-only settings.
 */
export const configureProject = (): UserWorkspaceConfig =>
  buildProjectConfig(unitTestInclude);

/**
 * Global configuration for use in the root vitest.config.ts of a monorepo.
 * Sets coverage, setupFiles, tags, and other global-only settings.
 * When `projects` is provided, generates inline project entries for each
 * resolved directory using {@link configureProject}. Directories with their
 * own vitest config are included as-is.
 *
 * Configures a `slow` test tag for long-running source tests. Filter at
 * runtime with `--tags-filter`:
 * - `--tags-filter="!slow"` — fast tests only
 * - `--tags-filter="slow"` — slow tests only
 * - (no filter) — all tests
 */
export const configureGlobal = (
  options: VitestConfigureGlobalOptions = {},
): ViteUserConfig => {
  const {
    coverageDirs,
    projects: projectPatterns,
    slow: slowOptions = {},
    tags: extraTags = [],
    ...setupOptions
  } = options;

  const resolved = projectPatterns === undefined
    ? undefined
    : resolveProjects(projectPatterns, configureProject);

  return buildGlobalConfig(
    {
      coverageInclude: resolveCoverageInclude(
        projectPatterns,
        coverageDirs,
      ),
      reportsDirectory: 'dist/coverage/vitest/all',
      tags: [
        { timeout: defaultSlowTimeout, ...slowOptions, name: 'slow' },
        ...extraTags,
      ],
    },
    setupOptions,
    resolved,
  );
};

const buildCombinedConfig = (
  options: VitestConfigureOptions,
  includeTestPatterns: boolean,
): ViteUserConfig => {
  const project = configureProject();
  return mergeConfig(
    configureGlobal(options),
    defineConfig({
      ...(project.resolve && { resolve: project.resolve }),
      test: {
        ...(project.test?.exclude && { exclude: project.test.exclude }),
        ...(includeTestPatterns && project.test?.include && {
          include: project.test.include,
        }),
      },
    }),
  );
};

/**
 * Combined configuration for single-project consumers.
 * Composes global settings with project-level excludes.
 * Omits `test.include` — single projects don't need explicit test patterns.
 */
export const configure = (
  options: VitestConfigureOptions = {},
): ViteUserConfig => buildCombinedConfig(options, false);

/**
 * Per-package configuration for Turborepo-managed monorepos.
 * Composes global settings with project-level includes and excludes.
 * Each package runs its own vitest instance with full coverage.
 */
export const configurePackage = (
  options: VitestConfigureOptions = {},
): ViteUserConfig => buildCombinedConfig(options, true);
