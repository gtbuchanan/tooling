import {
  type UserWorkspaceConfig,
  type ViteUserConfig,
  defaultExclude,
  defineConfig,
  mergeConfig,
} from 'vitest/config';
import { join } from 'node:path';

export interface VitestConfigureOptions {
  readonly consoleFailTest?: boolean;
  readonly hasAssertions?: boolean;
}

export const excludeDefault = [
  ...defaultExclude,
  '**/dist/**',
] as const;

const PACKAGE_NAME = '@gtbuchanan/vitest-config';

const resolveSetupFiles = (options: VitestConfigureOptions): string[] => {
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

/**
 * Per-project configuration for use with vitest projects.
 * Sets alias and excludes. Does not include global-only settings.
 * @param root - The project root directory (typically `import.meta.dirname`).
 *               Defaults to `process.cwd()`.
 */
export const configureProject = (root?: string): UserWorkspaceConfig => ({
  resolve: {
    alias: {
      '@': join(root ?? process.cwd(), 'src'),
    },
  },
  test: {
    exclude: [...excludeDefault],
    include: ['test/**/*.test.ts'],
  },
});

/**
 * Global configuration for use in the root vitest.config.ts of a monorepo.
 * Sets coverage, setupFiles, and other global-only settings.
 */
export const configureGlobal = (options: VitestConfigureOptions = {}): ViteUserConfig =>
  defineConfig({
    test: {
      coverage: {
        cleanOnRerun: false,
        exclude: [...excludeDefault],
        include: ['src/**/*.{cjs,cts,js,mjs,mts,ts,tsx}'],
        provider: 'v8',
        reportsDirectory: join(process.cwd(), 'dist/coverage'),
      },
      mockReset: true,
      setupFiles: resolveSetupFiles(options),
      unstubEnvs: true,
    },
  });

/**
 * Combined configuration for single-project consumers.
 * Composes global settings with project-level alias and excludes.
 * Omits the monorepo-specific `test.include` from `configureProject`.
 */
export const configure = (options: VitestConfigureOptions = {}): ViteUserConfig => {
  const { resolve, test } = configureProject();
  return mergeConfig(
    configureGlobal(options),
    defineConfig({
      ...(resolve && { resolve }),
      ...(test?.exclude && { test: { exclude: test.exclude } }),
    }),
  );
};
