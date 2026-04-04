import {
  type UserWorkspaceConfig,
  type ViteUserConfig,
  defaultExclude,
  defineConfig,
  mergeConfig,
} from 'vitest/config';
import { basename, join, resolve as resolvePath } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

export interface VitestConfigureOptions {
  readonly consoleFailTest?: boolean;
  readonly coverageDirs?: readonly string[];
  readonly hasAssertions?: boolean;
}

export interface VitestConfigureGlobalOptions extends VitestConfigureOptions {
  readonly projects?: readonly string[];
}

export const excludeDefault = [
  ...defaultExclude,
  '**/dist/**',
] as const;

const PACKAGE_NAME = '@gtbuchanan/vitest-config';

const COVERAGE_EXTENSIONS = '*.{cjs,cts,js,mjs,mts,ts,tsx}';

export const defaultCoverageDirs = [
  'bin',
  'scripts',
  'src',
] as const;

export const coverageInclude = defaultCoverageDirs.map(
  dir => `${dir}/**/${COVERAGE_EXTENSIONS}`,
);

export const resolveCoverageInclude = (
  projectPatterns?: readonly string[],
  dirs: readonly string[] = defaultCoverageDirs,
): readonly string[] => {
  const patterns = dirs.map(
    dir => `${dir}/**/${COVERAGE_EXTENSIONS}`,
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

export const resolveSetupFiles = (options: VitestConfigureOptions): string[] => {
  const { consoleFailTest = true, hasAssertions = true } = options;
  const setupFiles: string[] = [];
  if (consoleFailTest) {
    setupFiles.push(`${PACKAGE_NAME}/console-fail-test`);
  }
  if (hasAssertions) {
    setupFiles.push(`${PACKAGE_NAME}/setup`);
  }
  return setupFiles;
};

const VITEST_CONFIG_FILES = [
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'vitest.config.mjs',
] as const;

const hasVitestConfig = (dir: string): boolean =>
  VITEST_CONFIG_FILES.some(file => existsSync(join(dir, file)));

const GLOB_SUFFIX = '/*';

export const resolveProjectDirs = (
  patterns: readonly string[],
): string[] =>
  patterns.flatMap((pattern) => {
    if (pattern.endsWith(GLOB_SUFFIX)) {
      const parent = resolvePath(
        process.cwd(),
        pattern.slice(0, -GLOB_SUFFIX.length),
      );
      return readdirSync(parent, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(parent, entry.name));
    }
    return [resolvePath(process.cwd(), pattern)];
  });

/**
 * Builds an inline project entry from a directory and project config factory.
 * Adds `test.name` (from directory basename) and `test.root` to the config
 * produced by the factory.
 */
export const buildWorkspaceEntry = (
  dir: string,
  configureFn: (root: string) => UserWorkspaceConfig,
): UserWorkspaceConfig => {
  const config = configureFn(dir);
  return {
    ...config,
    test: {
      ...config.test,
      name: basename(dir),
      root: dir,
    },
  };
};

const buildProjectEntry = (
  dir: string,
  configureFn: (root: string) => UserWorkspaceConfig,
): string | UserWorkspaceConfig => {
  if (hasVitestConfig(dir)) {
    return dir;
  }
  return buildWorkspaceEntry(dir, configureFn);
};

const resolveProjects = (
  patterns: readonly string[],
  configureFn: (root: string) => UserWorkspaceConfig,
): (string | UserWorkspaceConfig)[] =>
  resolveProjectDirs(patterns).map(dir =>
    buildProjectEntry(dir, configureFn),
  );

export const buildProjectConfig = (
  include: readonly string[],
  root?: string,
): UserWorkspaceConfig => ({
  resolve: {
    alias: {
      '@': join(root ?? process.cwd(), 'src'),
    },
  },
  test: {
    exclude: [...excludeDefault],
    include: [...include],
  },
});

interface GlobalConfigSpec {
  readonly coverageInclude?: readonly string[];
  readonly reportsDirectory?: string;
  readonly testTimeout?: number;
}

export const buildGlobalConfig = (
  spec: GlobalConfigSpec,
  setupOptions: VitestConfigureOptions,
  resolvedProjects?: readonly (string | UserWorkspaceConfig)[],
): ViteUserConfig =>
  defineConfig({
    test: {
      ...(spec.reportsDirectory !== undefined && {
        coverage: {
          cleanOnRerun: false,
          exclude: [...excludeDefault],
          include: [...(spec.coverageInclude ?? coverageInclude)],
          provider: 'v8',
          reportsDirectory: join(
            process.cwd(),
            spec.reportsDirectory,
          ),
        },
      }),
      mockReset: true,
      setupFiles: resolveSetupFiles(setupOptions),
      ...(spec.testTimeout !== undefined && {
        testTimeout: spec.testTimeout,
      }),
      unstubEnvs: true,
      ...(resolvedProjects !== undefined && {
        projects: [...resolvedProjects],
      }),
    },
  });

const UNIT_TEST_INCLUDE = ['test/**/*.test.ts'] as const;

/**
 * Per-project configuration for use with vitest projects.
 * Sets alias and excludes. Does not include global-only settings.
 * @param root - The project root directory (typically `import.meta.dirname`).
 *               Defaults to `process.cwd()`.
 */
export const configureProject = (root?: string): UserWorkspaceConfig =>
  buildProjectConfig(UNIT_TEST_INCLUDE, root);

/**
 * Global configuration for use in the root vitest.config.ts of a monorepo.
 * Sets coverage, setupFiles, and other global-only settings.
 * When `projects` is provided, generates inline project entries for each
 * resolved directory using {@link configureProject}. Directories with their
 * own vitest config are included as-is.
 */
export const configureGlobal = (
  options: VitestConfigureGlobalOptions = {},
): ViteUserConfig => {
  const { coverageDirs, projects: projectPatterns, ...setupOptions } = options;
  const resolved = projectPatterns === undefined
    ? undefined
    : resolveProjects(projectPatterns, configureProject);
  return buildGlobalConfig(
    {
      coverageInclude: resolveCoverageInclude(
        projectPatterns,
        coverageDirs,
      ),
      reportsDirectory: 'dist/coverage',
    },
    setupOptions,
    resolved,
  );
};

/**
 * Combined configuration for single-project consumers.
 * Composes global settings with project-level alias and excludes.
 * Omits the monorepo-specific `test.include` from `configureProject`.
 */
export const configure = (
  options: VitestConfigureOptions = {},
): ViteUserConfig => {
  const project = configureProject();
  return mergeConfig(
    configureGlobal(options),
    defineConfig({
      ...(project.resolve && { resolve: project.resolve }),
      ...(project.test?.exclude && {
        test: { exclude: project.test.exclude },
      }),
    }),
  );
};
