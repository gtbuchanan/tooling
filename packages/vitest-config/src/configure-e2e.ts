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
  findConfigFile,
  resolveProjectDirs,
} from './configure.ts';
import { scriptFileExtensions } from './files.ts';

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

const e2eTestInclude = scriptFileExtensions.map(
  ext => `e2e/**/*.test.${ext}`,
);

const e2eConfigPrefix = 'vitest.config.e2e';

/**
 * Per-project e2e configuration for use with vitest projects.
 * Sets excludes and e2e include pattern. Does not include global-only settings.
 */
export const configureEndToEndProject = (): UserWorkspaceConfig =>
  buildProjectConfig(e2eTestInclude);

const buildE2eProjectEntry = (
  dir: string,
  testTimeout: number,
): string | UserWorkspaceConfig => {
  const configPath = findConfigFile(dir, e2eConfigPrefix);
  if (configPath !== undefined) {
    return configPath;
  }
  const entry = buildWorkspaceEntry(dir, configureEndToEndProject);
  return { ...entry, test: { ...entry.test, testTimeout } };
};

const resolveEndToEndProjects = (
  patterns: readonly string[],
  testTimeout: number,
): (string | UserWorkspaceConfig)[] =>
  resolveProjectDirs(patterns).map(dir =>
    buildE2eProjectEntry(dir, testTimeout),
  );

/**
 * Global e2e configuration for use in a root vitest.config.e2e.ts of a monorepo.
 * Sets setupFiles, testTimeout, and other global-only settings. Does not include coverage.
 * When `projects` is provided, directories with their own `vitest.config.e2e.*`
 * are included as-is; others get inline entries via {@link configureEndToEndProject}.
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

const buildCombinedE2eConfig = (
  options: VitestEndToEndConfigureOptions,
  includeTestPatterns: boolean,
): ViteUserConfig => {
  const project = configureEndToEndProject();
  return mergeConfig(
    configureEndToEndGlobal(options),
    defineConfig({
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
 * Combined e2e configuration for single-project consumers.
 * Composes global e2e settings with project-level excludes.
 * Omits the monorepo-specific `test.include` from `configureEndToEndProject`.
 */
export const configureEndToEnd = (
  options: VitestEndToEndConfigureOptions = {},
): ViteUserConfig => buildCombinedE2eConfig(options, false);

/**
 * Per-package e2e configuration for Turborepo-managed monorepos.
 * Composes global e2e settings with project-level includes and excludes.
 * Each package runs its own vitest instance via `vitest.config.e2e.ts`.
 */
export const configureEndToEndPackage = (
  options: VitestEndToEndConfigureOptions = {},
): ViteUserConfig => buildCombinedE2eConfig(options, true);
