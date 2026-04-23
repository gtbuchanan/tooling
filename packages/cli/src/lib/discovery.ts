import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Manifest } from './manifest.ts';
import { buildInclude, resolveBuildIncludes } from './tsconfig-gen.ts';
import {
  type ResolveWorkspaceOptions,
  readParsedManifest,
  resolveWorkspace,
} from './workspace.ts';

/** Capabilities detected for a single package. */
export interface PackageCapabilities {
  /** Resolved `include` directories from tsconfig.build.json (published packages only). */
  readonly buildIncludes: readonly string[];
  /** Package directory path. */
  readonly dir: string;
  /** Has a `bin/` directory. */
  readonly hasBin: boolean;
  /** Has an `e2e/` directory. */
  readonly hasE2e: boolean;
  /** Has one or more `generate:*` scripts in package.json. */
  readonly hasGenerate: boolean;
  /** Names of `generate:*` scripts found in package.json. */
  readonly generateScripts: readonly string[];
  /** Has ESLint config or `@gtbuchanan/eslint-config` dependency. */
  readonly hasEslint: boolean;
  /** Has a `scripts/` directory. */
  readonly hasScripts: boolean;
  /** Has a `skills/` directory containing authored Agent Skills. */
  readonly hasSkills: boolean;
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
}

/** Full workspace discovery result. */
export interface WorkspaceDiscovery {
  /** Whether a pnpm-workspace.yaml was found. */
  readonly isMonorepo: boolean;
  /** `@gtbuchanan/cli` is a workspace:* dependency (bootstrapping). */
  readonly isSelfHosted: boolean;
  /** Capabilities per workspace package. */
  readonly packages: readonly PackageCapabilities[];
  /** Root-level capabilities. */
  readonly root: PackageCapabilities;
  /** Workspace root directory. */
  readonly rootDir: string;
}

const hasDir = (base: string, name: string): boolean =>
  existsSync(path.join(base, name));

/** Lists files in a directory (returns empty array if dir doesn't exist). */
const listFiles = (dir: string): readonly string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

const hasFilePrefix = (files: readonly string[], prefix: string): boolean =>
  files.some(file => file.startsWith(`${prefix}.`));

const hasDep = (deps: Record<string, string>, name: string): boolean =>
  name in deps;

const parseManifest = (dir: string): Manifest => {
  try {
    return readParsedManifest(dir);
  } catch {
    return {};
  }
};

const mergeDeps = (manifest: Manifest): Record<string, string> => ({
  ...manifest.dependencies,
  ...manifest.devDependencies,
});

const collectGenerateScripts = (manifest: Manifest): readonly string[] =>
  Object.keys(manifest.scripts ?? {})
    .filter(name => name.startsWith('generate:'))
    .toSorted();

const buildCapabilities = (
  dir: string,
  manifest: Manifest,
): PackageCapabilities => {
  const deps = mergeDeps(manifest);
  const files = listFiles(dir);
  const hasVitest = hasDep(deps, '@gtbuchanan/vitest-config') ||
    hasFilePrefix(files, 'vitest.config');
  const hasTest = hasDir(dir, 'test');
  const generateScripts = collectGenerateScripts(manifest);
  const isPublished = manifest.private !== true && manifest.publishConfig?.directory !== undefined;

  return {
    buildIncludes: isPublished ? resolveBuildIncludes(dir) : buildInclude,
    dir,
    generateScripts,
    hasBin: hasDir(dir, 'bin'),
    hasE2e: hasDir(dir, 'e2e'),
    hasEslint: hasDep(deps, '@gtbuchanan/eslint-config') || hasFilePrefix(files, 'eslint.config'),
    hasGenerate: generateScripts.length > 0,
    hasScripts: hasDir(dir, 'scripts'),
    hasSkills: hasDir(dir, 'skills'),
    hasTest,
    hasTypeScript: hasDep(deps, '@gtbuchanan/tsconfig') || files.includes('tsconfig.json'),
    hasVitest,
    hasVitestE2e: hasFilePrefix(files, 'vitest.config.e2e'),
    hasVitestTests: hasVitest && hasTest,
    isPublished,
  };
};

/** Discovers capabilities for a single package directory. */
export const discoverPackage = (dir: string): PackageCapabilities =>
  buildCapabilities(dir, parseManifest(dir));

/** Discovers capabilities for an entire workspace. */
export const discoverWorkspace = (
  options?: ResolveWorkspaceOptions,
): WorkspaceDiscovery => {
  const ctx = resolveWorkspace(options);
  const isMonorepo = ctx.packageDirs.length > 1 ||
    ctx.packageDirs[0] !== ctx.rootDir;
  const rootManifest = parseManifest(ctx.rootDir);
  const rootDeps = mergeDeps(rootManifest);

  return {
    isMonorepo,
    isSelfHosted: rootDeps['@gtbuchanan/cli']?.startsWith('workspace:') === true,
    packages: ctx.packageDirs.map(dir => buildCapabilities(dir, parseManifest(dir))),
    root: buildCapabilities(ctx.rootDir, rootManifest),
    rootDir: ctx.rootDir,
  };
};
