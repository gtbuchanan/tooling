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
} from './configure.js';

export interface VitestEndToEndConfigureOptions extends VitestConfigureOptions {
  readonly testTimeout?: number;
}

export interface VitestEndToEndConfigureGlobalOptions extends VitestConfigureGlobalOptions {
  readonly testTimeout?: number;
}

const E2E_TEST_INCLUDE = ['e2e/**/*.test.ts'] as const;

/**
 * Per-project e2e configuration for use with vitest projects.
 * Sets alias, excludes, and e2e include pattern. Does not include global-only settings.
 * @param root - The project root directory (typically `import.meta.dirname`).
 *               Defaults to `process.cwd()`.
 */
export const configureEndToEndProject = (root?: string): UserWorkspaceConfig =>
  buildProjectConfig(E2E_TEST_INCLUDE, root);

const resolveEndToEndProjects = (
  patterns: readonly string[],
): UserWorkspaceConfig[] =>
  resolveProjectDirs(patterns).map(dir =>
    buildWorkspaceEntry(dir, configureEndToEndProject),
  );

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
    : resolveEndToEndProjects(projectPatterns);
  return buildGlobalConfig(
    { testTimeout },
    setupOptions,
    resolved,
  );
};

/**
 * Combined e2e configuration for single-project consumers.
 * Composes global e2e settings with project-level alias and excludes.
 * Omits the monorepo-specific `test.include` from `configureEndToEndProject`.
 */
export const configureEndToEnd = (
  options: VitestEndToEndConfigureOptions = {},
): ViteUserConfig => {
  const project = configureEndToEndProject();
  return mergeConfig(
    configureEndToEndGlobal(options),
    defineConfig({
      ...(project.resolve && { resolve: project.resolve }),
      ...(project.test?.exclude && {
        test: { exclude: project.test.exclude },
      }),
    }),
  );
};
