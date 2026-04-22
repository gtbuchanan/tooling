import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findUpSync } from 'find-up-simple';
import * as v from 'valibot';

/** Minimal package.json schema used for fixture workspace resolution. */
export const PackageJson = v.object({
  dependencies: v.optional(v.record(v.string(), v.string())),
  name: v.optional(v.string()),
  version: v.string(),
});

/** Inferred type from {@link PackageJson}. */
export type PackageJson = v.InferOutput<typeof PackageJson>;

/*
 * Workspace layout is coupled to the `packages/*` convention documented in
 * AGENTS.md. If the layout ever changes, update both this helper and
 * `buildWorkspaceIndex` — or drive them from `pnpm-workspace.yaml` globs.
 */
const findWorkspaceRoot = (): string => {
  const wsFile = findUpSync('pnpm-workspace.yaml', { cwd: process.cwd() });
  return wsFile === undefined ? process.cwd() : path.dirname(wsFile);
};

/*
 * Workspace state is stable across test fixtures within a single worker.
 * Memoize the derived values so each additional fixture is O(1).
 */
const cache: {
  index?: ReadonlyMap<string, PackageJson>;
  root?: string;
} = {};

/** Returns the workspace root directory, memoized per worker. */
export const getWorkspaceRoot = (): string =>
  cache.root ??= findWorkspaceRoot();

const buildWorkspaceIndex = (): ReadonlyMap<string, PackageJson> => {
  const wsRoot = getWorkspaceRoot();
  const index = new Map<string, PackageJson>();

  for (const pkgJsonPath of globSync('packages/*/package.json', { cwd: wsRoot })) {
    const abs = path.join(wsRoot, pkgJsonPath);
    const pkg = v.parse(PackageJson, JSON.parse(readFileSync(abs, 'utf8')));
    if (pkg.name !== undefined) index.set(pkg.name, pkg);
  }

  return index;
};

/** Returns the workspace package index keyed by package name, memoized per worker. */
export const getWorkspaceIndex = (): ReadonlyMap<string, PackageJson> =>
  cache.index ??= buildWorkspaceIndex();

/**
 * Recursively collects all transitive `workspace:` dependencies from
 * a package's `dependencies` field. These are co-published workspace
 * packages whose tarballs must be installed alongside the primary package.
 * `devDependencies` and `peerDependencies` are intentionally excluded —
 * they are not co-published.
 */
export const resolveWorkspaceDeps = (
  packageName: string,
  index: ReadonlyMap<string, PackageJson>,
  visited = new Set<string>(),
): readonly string[] => {
  if (visited.has(packageName)) return [];
  visited.add(packageName);

  const pkg = index.get(packageName);
  if (pkg === undefined) return [];

  const direct = Object.entries(pkg.dependencies ?? {})
    .filter(([, spec]) => spec.startsWith('workspace:'))
    .map(([name]) => name);

  return [
    ...direct,
    ...direct.flatMap(dep => resolveWorkspaceDeps(dep, index, visited)),
  ];
};
