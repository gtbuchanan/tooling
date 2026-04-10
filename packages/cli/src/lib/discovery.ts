import { existsSync, globSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import { ManifestSchema } from './manifest.ts';
import { readManifest, resolveWorkspace } from './workspace.ts';

/** Capabilities detected for a single package. */
export interface PackageCapabilities {
  /** Package directory path. */
  readonly dir: string;
  /** Existing compile script value (preserved by turbo:init). */
  readonly existingCompileScript: string | undefined;
  /** Has an `e2e/` directory. */
  readonly hasE2e: boolean;
  /** Has ESLint config or `@gtbuchanan/eslint-config` dependency. */
  readonly hasEslint: boolean;
  /** Has oxlint config or `@gtbuchanan/oxlint-config` dependency. */
  readonly hasOxlint: boolean;
  /** Has a `scripts/` directory. */
  readonly hasScripts: boolean;
  /** Has a `src/` directory. */
  readonly hasSrc: boolean;
  /** Has a `test/` directory. */
  readonly hasTest: boolean;
  /** Has `@gtbuchanan/tsconfig` dependency or `tsconfig.json`. */
  readonly hasTypeScript: boolean;
  /** Has `@gtbuchanan/vitest-config` dependency or `vitest.config.*`. */
  readonly hasVitest: boolean;
  /** Has Vitest config AND a `test/` directory. */
  readonly hasVitestTests: boolean;
  /** Has `vitest.config.e2e.*` file. */
  readonly hasVitestE2e: boolean;
  /** Published package (not private, has publishConfig.directory). */
  readonly isPublished: boolean;
  /** `@gtbuchanan/cli` is a workspace:* dependency (bootstrapping). */
  readonly isSelfHosted: boolean;
}

/** Full workspace discovery result. */
export interface WorkspaceDiscovery {
  /** Whether a pnpm-workspace.yaml was found. */
  readonly isMonorepo: boolean;
  /** Capabilities per workspace package. */
  readonly packages: readonly PackageCapabilities[];
  /** Root-level capabilities. */
  readonly root: PackageCapabilities;
  /** Workspace root directory. */
  readonly rootDir: string;
}

/** Options for {@link discoverWorkspace}. */
export interface DiscoverWorkspaceOptions {
  /** Directory to search from. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

const hasDir = (base: string, name: string): boolean =>
  existsSync(join(base, name));

const hasConfigFile = (base: string, prefix: string): boolean =>
  globSync(`${prefix}.*`, { cwd: base }).length > 0;

const hasDep = (deps: Record<string, string>, name: string): boolean =>
  name in deps;

const parseManifest = (dir: string): v.InferOutput<typeof ManifestSchema> => {
  try {
    return v.parse(ManifestSchema, readManifest(dir));
  } catch {
    return {};
  }
};

const mergeDeps = (
  manifest: v.InferOutput<typeof ManifestSchema>,
): Record<string, string> => ({
  ...manifest.dependencies,
  ...manifest.devDependencies,
});

/** Discovers capabilities for a single package directory. */
export const discoverPackage = (dir: string): PackageCapabilities => {
  const manifest = parseManifest(dir);
  const deps = mergeDeps(manifest);
  const scripts = manifest.scripts ?? {};
  const hasVitest = hasDep(deps, '@gtbuchanan/vitest-config') ||
    hasConfigFile(dir, 'vitest.config');
  const hasTest = hasDir(dir, 'test');

  return {
    dir,
    existingCompileScript: scripts['compile'],
    hasE2e: hasDir(dir, 'e2e'),
    hasEslint: hasDep(deps, '@gtbuchanan/eslint-config') || hasConfigFile(dir, 'eslint.config'),
    hasOxlint: hasDep(deps, '@gtbuchanan/oxlint-config') || hasConfigFile(dir, 'oxlint.config'),
    hasScripts: hasDir(dir, 'scripts'),
    hasSrc: hasDir(dir, 'src'),
    hasTest,
    hasTypeScript: hasDep(deps, '@gtbuchanan/tsconfig') || existsSync(join(dir, 'tsconfig.json')),
    hasVitest,
    hasVitestE2e: hasConfigFile(dir, 'vitest.config.e2e'),
    hasVitestTests: hasVitest && hasTest,
    isPublished: manifest.private !== true && manifest.publishConfig?.directory !== undefined,
    isSelfHosted: deps['@gtbuchanan/cli']?.startsWith('workspace:') === true,
  };
};

/** Discovers capabilities for an entire workspace. */
export const discoverWorkspace = (
  options?: DiscoverWorkspaceOptions,
): WorkspaceDiscovery => {
  const ctx = resolveWorkspace(options);
  const isMonorepo = ctx.packageDirs.length > 1 ||
    ctx.packageDirs[0] !== ctx.rootDir;
  const root = discoverPackage(ctx.rootDir);
  const packages = ctx.packageDirs.map(discoverPackage);

  return { isMonorepo, packages, root, rootDir: ctx.rootDir };
};
