import {
  type UserWorkspaceConfig,
  type ViteUserConfig,
  defineConfig,
  mergeConfig,
} from 'vitest/config';
import {
  type VitestConfigureGlobalOptions,
  type VitestConfigureOptions,
  buildGlobalConfig,
  buildProjectConfig,
  buildWorkspaceEntry,
  resolveProjectDirs,
} from './configure.ts';

/** Options for combined e2e configuration ({@link configureEndToEnd}). */
export interface VitestEndToEndConfigureOptions extends VitestConfigureOptions {
  /**
   * Test timeout in milliseconds.
   * @defaultValue 300_000
   */
  readonly testTimeout?: number;
}

/** Options for global e2e configuration ({@link configureEndToEndGlobal}). */
export interface VitestEndToEndConfigureGlobalOptions extends VitestConfigureGlobalOptions {
  /**
   * Test timeout in milliseconds.
   * @defaultValue 300_000
   */
  readonly testTimeout?: number;
}

const E2E_TEST_INCLUDE = ['e2e/**/*.test.ts'] as const;

/**
 * Per-project e2e configuration for use with vitest projects.
 * Sets excludes and e2e include pattern. Does not include global-only settings.
 */
export const configureEndToEndProject = (): UserWorkspaceConfig =>
  buildProjectConfig(E2E_TEST_INCLUDE);

const resolveEndToEndProjects = (
  patterns: readonly string[],
  testTimeout: number,
): UserWorkspaceConfig[] =>
  resolveProjectDirs(patterns).map((dir) => {
    const entry = buildWorkspaceEntry(dir, configureEndToEndProject);
    return { ...entry, test: { ...entry.test, testTimeout } };
  });

/**
 * Global e2e configuration for use in a root vitest.config.e2e.ts of a monorepo.
 * Sets setupFiles, testTimeout, and other global-only settings. Does not include coverage.
 * When `projects` is provided, generates inline project entries for each
 * resolved directory using {@link configureEndToEndProject}. Unlike the unit
 * test variant, e2e always generates inline configs (no per-package e2e config
 * file convention).
 */
export const configureEndToEndGlobal = (
  options: VitestEndToEndConfigureGlobalOptions = {},
): ViteUserConfig => {
  const { projects: projectPatterns, testTimeout = 300_000, ...setupOptions } = options;
  const resolved = projectPatterns === undefined
    ? undefined
    : resolveEndToEndProjects(projectPatterns, testTimeout);
  return buildGlobalConfig(
    { testTimeout },
    setupOptions,
    resolved,
  );
};

/**
 * Combined e2e configuration for single-project consumers.
 * Composes global e2e settings with project-level excludes.
 * Omits the monorepo-specific `test.include` from `configureEndToEndProject`.
 */
export const configureEndToEnd = (
  options: VitestEndToEndConfigureOptions = {},
): ViteUserConfig => {
  const project = configureEndToEndProject();
  return mergeConfig(
    configureEndToEndGlobal(options),
    defineConfig({
      ...(project.test?.exclude && {
        test: { exclude: project.test.exclude },
      }),
    }),
  );
};
