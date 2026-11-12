import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Capability } from '#src/core/capability.js';
import { generateTaskPrefix } from '#src/core/layout.js';
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
   * The capabilities its toolchains declared that hold in the package.
   */
  readonly capabilities: ReadonlySet<Capability>;
  /**
   * Package directory path.
   */
  readonly dir: string;
  /**
   * Names of `generate:*` scripts found in package.json.
   */
  readonly generateScripts: readonly string[];
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

/*
 * The files mise reads a project's config and lockfile from, sorted. A
 * `.local` variant is one developer's override and stays out, so it cannot
 * move the cache for everyone else.
 */
const miseFileCandidates = [
  '.config/mise.lock',
  '.config/mise.toml',
  '.config/mise/config.toml',
  '.mise.toml',
  'mise.lock',
  'mise.toml',
] as const;

// The files hk reads a project's config from, sorted. `hk.local.pkl` stays out like mise's.
const hkFileCandidates = ['.config/hk.pkl', 'hk.pkl'] as const;

/**
 * Full workspace discovery result.
 */
export interface WorkspaceDiscovery {
  /**
   * Root manifest declares an `@gtbuchanan/cli` dependency (any version).
   */
  readonly dependsOnCli: boolean;
  /**
   * The hk config files present at the root, as sorted POSIX paths relative
   * to it.
   */
  readonly hkFiles: readonly string[];
  /**
   * Whether a pnpm-workspace.yaml was found.
   */
  readonly isMonorepo: boolean;
  /**
   * `@gtbuchanan/cli` is a workspace:* dependency (bootstrapping).
   */
  readonly isSelfHosted: boolean;
  /**
   * The mise config and lockfiles present at the root, as sorted POSIX paths
   * relative to it. They pin the toolchain every task runs on.
   */
  readonly miseFiles: readonly string[];
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

const isFile = (file: string): boolean =>
  statSync(file, { throwIfNoEntry: false })?.isFile() === true;

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

  return {
    capabilities: new Set(capabilities.filter(capability =>
      capability.detect({ dir, entries: files, manifest }))),
    dir,
    generateScripts: collectGenerateScripts(manifest),
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
    hkFiles: hkFileCandidates.filter(file => isFile(path.join(ctx.rootDir, file))),
    isMonorepo,
    isSelfHosted: rootDeps['@gtbuchanan/cli']?.startsWith('workspace:') === true,
    miseFiles: miseFileCandidates.filter(file => isFile(path.join(ctx.rootDir, file))),
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
