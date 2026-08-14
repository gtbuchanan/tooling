import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { generateTaskPrefix } from '../commands/task/names.ts';
import type { Manifest } from './manifest.ts';
import { hasPackageBlock } from './pkl-project.ts';
import { localeComparer } from './sort.ts';
import { buildInclude, resolveBuildIncludes } from './tsconfig-gen.ts';
import {
  type ResolveWorkspaceOptions,
  readParsedManifest,
  resolveWorkspace,
} from './workspace.ts';

/**
 * Capabilities detected for a single package.
 */
export interface PackageCapabilities {
  /**
   * Resolved `include` directories from tsconfig.build.json (published packages only).
   */
  readonly buildIncludes: readonly string[];
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
   * Has hand-authored Pkl package source — a `*.pkl` file other than the hk
   * config `hk.pkl`. Excluding `hk.pkl` keeps a single-package repo that
   * merely *uses* hk (its root is the lone package) from being mistaken for a
   * Pkl package. Drives `typecheck:pkl` (all Pkl source is validated), not
   * publishing — see {@link hasPklPackage}.
   */
  readonly hasPkl: boolean;
  /**
   * Has a *publishable* Pkl package: {@link hasPkl} and its `PklProject`
   * declares a `package {}` block. The block is Pkl's own definition of a
   * distributable package (`pkl project package` needs it), so its presence is
   * the publish signal — a deps-only or block-less Pkl project stays internal.
   * Drives `PklProject` version-stamping, `pack:pkl`, and `gtb publish`.
   */
  readonly hasPklPackage: boolean;
  /**
   * Names of `generate:*` scripts found in package.json.
   */
  readonly generateScripts: readonly string[];
  /**
   * Has ESLint config or `@gtbuchanan/eslint-config` dependency.
   */
  readonly hasEslint: boolean;
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
   * Has `@gtbuchanan/tsconfig` dependency or `tsconfig.json`.
   */
  readonly hasTypeScript: boolean;
  /**
   * Has `@gtbuchanan/vitest-config` dependency or `vitest.config.*`.
   */
  readonly hasVitest: boolean;
  /**
   * Has Vitest config AND a `test/` directory.
   */
  readonly hasVitestTests: boolean;
  /**
   * Has `vitest.config.e2e.*` file.
   */
  readonly hasVitestE2e: boolean;
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

const hasFilePrefix = (files: readonly string[], prefix: string): boolean =>
  files.some(file => file.startsWith(`${prefix}.`));

/**
 * Reads a package's `PklProject` source, or `''` when absent.
 */
const readPklProject = (dir: string): string => {
  try {
    return readFileSync(path.join(dir, 'PklProject'), 'utf8');
  } catch {
    return '';
  }
};

const hasDep = (deps: Record<string, string>, name: string): boolean =>
  Object.hasOwn(deps, name);

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
): PackageCapabilities => {
  const deps = mergeDeps(manifest);
  const files = listFiles(dir);
  const hasVitest = hasDep(deps, '@gtbuchanan/vitest-config') ||
    hasFilePrefix(files, 'vitest.config');
  const hasTest = hasDir(dir, 'test');
  const generateScripts = collectGenerateScripts(manifest);
  const isPublished = manifest.private !== true && manifest.publishConfig?.directory !== undefined;
  const hasPkl = files.some(file => file.endsWith('.pkl') && file !== 'hk.pkl');
  const hasPklPackage = hasPkl && hasPackageBlock(readPklProject(dir));

  return {
    buildIncludes: isPublished ? resolveBuildIncludes(dir) : buildInclude,
    dir,
    generateScripts,
    hasBin: hasDir(dir, 'bin'),
    hasE2e: hasDir(dir, 'e2e'),
    hasEslint: hasDep(deps, '@gtbuchanan/eslint-config') || hasFilePrefix(files, 'eslint.config'),
    hasGenerate: generateScripts.length > 0,
    hasPkl,
    hasPklPackage,
    hasScripts: hasDir(dir, 'scripts'),
    hasSkills: hasDir(dir, 'skills'),
    hasSrc: hasDir(dir, 'src'),
    hasTest,
    hasTypeScript: hasDep(deps, '@gtbuchanan/tsconfig') || files.includes('tsconfig.json'),
    hasVitest,
    hasVitestE2e: hasFilePrefix(files, 'vitest.config.e2e'),
    hasVitestTests: hasVitest && hasTest,
    isPublished,
    name: manifest.name ?? path.basename(dir),
    workspaceDependencies: collectWorkspaceDependencies(manifest),
  };
};

/**
 * Discovers capabilities for a single package directory.
 */
export const discoverPackage = (dir: string): PackageCapabilities =>
  buildCapabilities(dir, parseManifest(dir));

/**
 * Discovers capabilities for an entire workspace.
 */
export const discoverWorkspace = (
  options?: ResolveWorkspaceOptions,
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
    packages: ctx.packageDirs.map(dir => buildCapabilities(dir, parseManifest(dir))),
    packageGlobs: ctx.packageGlobs,
    root: buildCapabilities(ctx.rootDir, rootManifest),
    rootDir: ctx.rootDir,
  };
};
