import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Capability } from '#src/core/capability.js';
import {
  buildInclude, generateTaskPrefix, resolveBuildIncludes,
} from '#src/core/layout.js';
import type { Manifest } from '#src/core/manifest.js';
import { localeComparer } from '#src/core/sort.js';
import {
  type ResolveWorkspaceOptions,
  readParsedManifest,
  resolveWorkspace,
} from '#src/core/workspace.js';

/**
 * Capabilities detected for a single package.
 */
export interface PackageCapabilities {
  /**
   * Resolved `include` directories from tsconfig.build.json (published packages only).
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
   * Has a `skills/` directory containing authored Agent Skills.
   */
  readonly hasSkills: boolean;
  /**
   * Has a `src/` directory.
   */
  readonly hasSrc: boolean;
  /**
   * Has a `test/` directory.
   */
  readonly hasTest: boolean;
  /**
   * Published package (not private, has publishConfig.directory).
   */
  readonly isPublished: boolean;
  /**
   * Manifest `name` (scoped, as declared), falling back to the directory
   * basename when the manifest declares none. Prefer this over the basename
   * for anything that gets committed: a package's directory name is a
   * property of the checkout (worktrees and clones rename it), while its
   * manifest name is stable across every checkout.
   */
  readonly name: string;
  /**
   * Names of workspace packages this package depends on *at install time*:
   * every `workspace:` specifier in `dependencies`, `peerDependencies`, or
   * `optionalDependencies` that the tarball doesn't ship itself. Sorted and
   * deduplicated.
   *
   * All three fields survive publish and get pnpm's `workspace:` → concrete
   * version rewrite at pack time, so each one can point a consumer at a
   * version that was never published. `devDependencies` is excluded because
   * publishing strips it — a build-time-only workspace package (one a bundler
   * inlines, say) belongs there and is correctly invisible here. So is
   * anything `bundleDependencies` actually bundles; see {@link
   * bundledPredicate} for why that isn't the whole field.
   */
  readonly workspaceDependencies: readonly string[];
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
   * Capabilities per workspace package.
   */
  readonly packages: readonly PackageCapabilities[];
  /**
   * Raw `packages` globs from pnpm-workspace.yaml. Empty in single-package mode.
   */
  readonly packageGlobs: readonly string[];
  /**
   * Root-level capabilities.
   */
  readonly root: PackageCapabilities;
  /**
   * Workspace root directory.
   */
  readonly rootDir: string;
}

/**
 * The workspace package that vendors `@gtbuchanan/cli`, wherever the
 * workspace keeps it. Undefined outside a self-hosted workspace.
 */
export const vendoredCli = (discovery: WorkspaceDiscovery): PackageCapabilities | undefined =>
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

/**
 * Manifest fields a published tarball carries into a consumer's install.
 */
const runtimeDependencyFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

type RuntimeDependencyField = typeof runtimeDependencyFields[number];

/**
 * The one field `bundleDependencies: true` covers.
 */
const bundleAllField: RuntimeDependencyField = 'dependencies';

/**
 * Builds the "does the tarball ship this itself?" predicate from
 * `bundleDependencies` (or its `bundledDependencies` alias). A bundled package
 * never resolves from the registry, so its specifier can't 404.
 *
 * The two forms bundle different things, measured against `pnpm pack`:
 * an explicit name list bundles that package out of whichever field declares
 * it, while `true` covers `dependencies` alone — a workspace peer or optional
 * dependency keeps its rewritten specifier but is left out of the tarball, so
 * treating `true` as "everything" would hide the exact breakage this feeds.
 *
 * (pnpm honors `bundleDependencies` only under `nodeLinker: hoisted`; it
 * hard-errors on the default isolated linker.)
 */
const bundledPredicate = (
  manifest: Manifest,
): ((field: RuntimeDependencyField, name: string) => boolean) => {
  const bundled = manifest.bundleDependencies ?? manifest.bundledDependencies;
  if (bundled === undefined || bundled === false) {
    return () => false;
  }

  if (bundled === true) {
    return field => field === bundleAllField;
  }

  const names = new Set(bundled);

  return (_field, name) => names.has(name);
};

const collectWorkspaceDependencies = (manifest: Manifest): readonly string[] => {
  const isBundled = bundledPredicate(manifest);
  const names = runtimeDependencyFields.flatMap(field =>
    Object.entries(manifest[field] ?? {})
      .filter(([name, spec]) => spec.startsWith('workspace:') && !isBundled(field, name))
      .map(([name]) => name),
  );

  return [...new Set(names)].toSorted(localeComparer);
};

const collectGenerateScripts = (manifest: Manifest): readonly string[] =>
  Object.keys(manifest.scripts ?? {})
    .filter(name => name.startsWith(generateTaskPrefix))
    .toSorted(localeComparer);

const buildCapabilities = (
  dir: string,
  manifest: Manifest,
  capabilities: readonly Capability[],
): PackageCapabilities => {
  const files = listFiles(dir);
  const generateScripts = collectGenerateScripts(manifest);
  const isPublished = manifest.private !== true && manifest.publishConfig?.directory !== undefined;

  return {
    buildIncludes: isPublished ? resolveBuildIncludes(dir) : buildInclude,
    capabilities: new Set(capabilities.filter(capability =>
      capability.detect({ dir, entries: files, manifest }))),
    dir,
    generateScripts,
    hasBin: hasDir(dir, 'bin'),
    hasE2e: hasDir(dir, 'e2e'),
    hasGenerate: generateScripts.length > 0,
    hasScripts: hasDir(dir, 'scripts'),
    hasSkills: hasDir(dir, 'skills'),
    hasSrc: hasDir(dir, 'src'),
    hasTest: hasDir(dir, 'test'),
    isPublished,
    name: manifest.name ?? path.basename(dir),
    workspaceDependencies: collectWorkspaceDependencies(manifest),
  };
};

/**
 * Discovers a single package directory, detecting `capabilities` in it.
 */
export const discoverPackage = (
  dir: string,
  capabilities: readonly Capability[],
): PackageCapabilities => buildCapabilities(dir, parseManifest(dir), capabilities);

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
    packages: ctx.packageDirs.map(dir => buildCapabilities(dir, parseManifest(dir), capabilities)),
    packageGlobs: ctx.packageGlobs,
    root: buildCapabilities(ctx.rootDir, rootManifest, capabilities),
    rootDir: ctx.rootDir,
  };
};
