import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Capability } from '#src/core/capability.js';
import {
  generateTaskPrefix, resolveBuildIncludes,
} from '#src/core/layout.js';
import type { Manifest } from '#src/core/manifest.js';
import { localeComparer } from '#src/core/sort.js';
import {
  type PackageGlob,
  type ResolveWorkspaceOptions,
  readParsedManifest,
  resolveWorkspace,
} from '#src/core/workspace.js';

/**
 * A workspace package (or the workspace root) as discovery found it.
 */
export interface WorkspacePackage {
  /**
   * Resolved `include` directories from tsconfig.build.json, or the default
   * build include when there is none. Only a published package compiles them.
   */
  readonly buildIncludes: readonly string[];
  /**
   * The capabilities its toolchains declared that hold in the package.
   */
  readonly capabilities: ReadonlySet<Capability>;
  /**
   * Package directory path.
   */
  readonly dir: string;
  /**
   * Has a `bin/` directory.
   */
  readonly hasBin: boolean;
  /**
   * Has an `e2e/` directory.
   */
  readonly hasE2e: boolean;
  /**
   * Has one or more `generate:*` scripts in package.json.
   */
  readonly hasGenerate: boolean;
  /**
   * Names of `generate:*` scripts found in package.json.
   */
  readonly generateScripts: readonly string[];
  /**
   * Has a `scripts/` directory.
   */
  readonly hasScripts: boolean;
  /**
   * Has a `src/` directory.
   */
  readonly hasSrc: boolean;
  /**
   * Has a `test/` directory.
   */
  readonly hasTest: boolean;
  /**
   * The package's `package.json`, or `{}` when it has none. A toolchain reads
   * what it needs of it in a function beside the capabilities it declares.
   */
  readonly manifest: Manifest;
  /**
   * Manifest `name` (scoped, as declared), falling back to the directory
   * basename when the manifest declares none. Prefer this over the basename
   * for anything that gets committed: a package's directory name is a
   * property of the checkout (worktrees and clones rename it), while its
   * manifest name is stable across every checkout.
   */
  readonly name: string;
}

/**
 * Full workspace discovery result.
 */
export interface WorkspaceDiscovery {
  /**
   * Root manifest declares an `@gtbuchanan/cli` dependency (any version).
   */
  readonly dependsOnCli: boolean;
  /**
   * Workspace root has a `mise.toml` pinning dev tool versions.
   */
  readonly hasMise: boolean;
  /**
   * Whether a pnpm-workspace.yaml was found.
   */
  readonly isMonorepo: boolean;
  /**
   * `@gtbuchanan/cli` is a workspace:* dependency (bootstrapping).
   */
  readonly isSelfHosted: boolean;
  /**
   * The packages matched by the workspace globs.
   */
  readonly packages: readonly WorkspacePackage[];
  /**
   * The `packages` globs from pnpm-workspace.yaml, each with the package
   * directories it matched. Empty in single-package mode.
   */
  readonly packageGlobs: readonly PackageGlob[];
  /**
   * The workspace root, discovered like any package.
   */
  readonly root: WorkspacePackage;
  /**
   * Workspace root directory.
   */
  readonly rootDir: string;
}

/**
 * The workspace package that vendors `@gtbuchanan/cli`, wherever the
 * workspace keeps it. Undefined outside a self-hosted workspace.
 */
export const vendoredCli = (discovery: WorkspaceDiscovery): WorkspacePackage | undefined =>
  discovery.packages.find(pkg => pkg.name === '@gtbuchanan/cli');

const hasDir = (base: string, name: string): boolean =>
  existsSync(path.join(base, name));

/**
 * Lists files in a directory (returns empty array if dir doesn't exist).
 */
const listFiles = (dir: string): readonly string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

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
    .filter(name => name.startsWith(generateTaskPrefix))
    .toSorted(localeComparer);

const buildPackage = (
  dir: string,
  manifest: Manifest,
  capabilities: readonly Capability[],
): WorkspacePackage => {
  const files = listFiles(dir);
  const generateScripts = collectGenerateScripts(manifest);

  return {
    buildIncludes: resolveBuildIncludes(dir),
    capabilities: new Set(capabilities.filter(capability =>
      capability.detect({ dir, entries: files, manifest }))),
    dir,
    generateScripts,
    hasBin: hasDir(dir, 'bin'),
    hasE2e: hasDir(dir, 'e2e'),
    hasGenerate: generateScripts.length > 0,
    hasScripts: hasDir(dir, 'scripts'),
    hasSrc: hasDir(dir, 'src'),
    hasTest: hasDir(dir, 'test'),
    manifest,
    name: manifest.name ?? path.basename(dir),
  };
};

/**
 * Discovers a single package directory, detecting `capabilities` in it.
 */
export const discoverPackage = (
  dir: string,
  capabilities: readonly Capability[],
): WorkspacePackage => buildPackage(dir, parseManifest(dir), capabilities);

/**
 * Options for {@link discoverWorkspace}.
 */
export interface DiscoverWorkspaceOptions extends ResolveWorkspaceOptions {
  /**
   * What to look for, which is every toolchain's. Required, so a caller
   * cannot discover a workspace in which nothing ever holds.
   */
  readonly capabilities: readonly Capability[];
}

/**
 * Discovers every package of a workspace, and its root.
 */
export const discoverWorkspace = (
  { capabilities, ...options }: DiscoverWorkspaceOptions,
): WorkspaceDiscovery => {
  const ctx = resolveWorkspace(options);
  const isMonorepo = ctx.packageDirs.length > 1 ||
    ctx.packageDirs[0] !== ctx.rootDir;
  const rootManifest = parseManifest(ctx.rootDir);
  const rootDeps = mergeDeps(rootManifest);

  return {
    dependsOnCli: '@gtbuchanan/cli' in rootDeps,
    hasMise: existsSync(path.join(ctx.rootDir, 'mise.toml')),
    isMonorepo,
    isSelfHosted: rootDeps['@gtbuchanan/cli']?.startsWith('workspace:') === true,
    packages: ctx.packageDirs.map(dir => buildPackage(dir, parseManifest(dir), capabilities)),
    packageGlobs: ctx.packageGlobs,
    root: buildPackage(ctx.rootDir, rootManifest, capabilities),
    rootDir: ctx.rootDir,
  };
};

/**
 * Whether gtb drives the workspace's build, which only a root depending on
 * `@gtbuchanan/cli` does (a self-hosted root included). An hk-only adopter
 * runs gtb from mise for its hooks and owns whatever build config it has, so
 * the steps that generate turbo, scripts and tsconfigs leave it alone.
 */
export const isGtbBuild = ({ dependsOnCli }: WorkspaceDiscovery): boolean => dependsOnCli;
