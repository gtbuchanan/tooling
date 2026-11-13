/*
 * SPIKE: runner-neutral task edges. A leaf states what it needs in workspace
 * terms, and each runner renders that its own way: turbo through `^` edges
 * and its `generate`/`transit` nodes, mise through explicit `//<pkg>:<task>`
 * dependencies and `sources`.
 */
import path from 'node:path';
import type { WorkspaceDiscovery, WorkspacePackage } from '#src/core/discovery.js';
import { toPosixRelative } from '#src/core/paths.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import { workspaceGenerateScripts } from '#src/tasks/edges.js';
import { topo } from '#src/tasks/turbo-task.js';

/** Whose task an edge points at, relative to the package running the leaf. */
export type Scope = 'dependencies' | 'self';

/** One thing a leaf needs before it runs, or folded into its freshness. */
export type Need =
  /** The package's (or its dependencies') author-owned codegen has run. */
  | { readonly kind: 'codegen'; readonly scope: Scope }
  /** A change to any workspace dependency's sources invalidates the leaf. */
  | { readonly kind: 'dependency-sources' }
  /** Another leaf has run, here or in every workspace dependency. */
  | { readonly kind: 'task'; readonly name: string; readonly scope: Scope };

/** Where a leaf runs: in a package, or at the workspace root. */
export type Site = { readonly kind: 'package' } | { readonly kind: 'root' };

const hasGenerate = (discovery: WorkspaceDiscovery): boolean =>
  workspaceGenerateScripts(discovery).length > 0;

/*
 * The root defines neither `generate` nor `transit`, so turbo resolves only
 * their `^` forms there, against the root manifest's workspace dependencies.
 */
const turboEdge = (need: Need, site: Site, discovery: WorkspaceDiscovery): readonly string[] => {
  switch (need.kind) {
    case 'codegen': {
      if (!hasGenerate(discovery)) {
        return [];
      }
      return need.scope === 'self'
        ? (site.kind === 'root' ? [] : [Aggregate.generate])
        : [topo(Aggregate.generate)];
    }
    case 'dependency-sources': {
      return [site.kind === 'root' ? topo(Aggregate.transit) : Aggregate.transit];
    }
    case 'task': {
      return [need.scope === 'self' ? need.name : topo(need.name)];
    }
  }
};

/** The `dependsOn` turbo needs for a leaf's needs at a site. */
export const turboDependsOn = (
  needs: readonly Need[],
  site: Site,
  discovery: WorkspaceDiscovery,
): readonly string[] => needs.flatMap(need => turboEdge(need, site, discovery));

// --- mise -----------------------------------------------------------------

const dependencyNames = (pkg: Pick<WorkspacePackage, 'manifest'>): readonly string[] => [
  ...Object.keys(pkg.manifest.dependencies ?? {}),
  ...Object.keys(pkg.manifest.devDependencies ?? {}),
  ...Object.keys(pkg.manifest.optionalDependencies ?? {}),
  ...Object.keys(pkg.manifest.peerDependencies ?? {}),
];

/*
 * The workspace packages a package reaches through its manifest, transitively,
 * which is the set turbo walks for a `^` edge chain such as `transit`.
 */
export const workspaceDependencies = (
  pkg: Pick<WorkspacePackage, 'manifest' | 'name'>,
  discovery: WorkspaceDiscovery,
): readonly WorkspacePackage[] => {
  const byName = new Map(discovery.packages.map(candidate => [candidate.name, candidate]));
  const seen = new Set<string>([pkg.name]);
  const walk = (from: Pick<WorkspacePackage, 'manifest'>): readonly WorkspacePackage[] =>
    dependencyNames(from).flatMap((name) => {
      const dep = byName.get(name);
      if (dep === undefined || seen.has(name)) {
        return [];
      }
      seen.add(name);
      return [dep, ...walk(dep)];
    });

  return walk(pkg);
};

/** A mise task's `depends` and the `sources` its needs add. */
export interface MiseEdges {
  readonly depends: readonly string[];
  readonly sources: readonly string[];
}

const projectPath = (discovery: WorkspaceDiscovery, dir: string): string =>
  `//${toPosixRelative(discovery.rootDir, dir)}`;

/** What the mise renderer asks of the workspace. */
export interface MiseContext {
  readonly discovery: WorkspaceDiscovery;
  /** Whether a package runs the named task. */
  readonly hasTask: (name: string, pkg: WorkspacePackage) => boolean;
  /** A package's own input globs, relative to it, standing in for turbo's whole-package hash. */
  readonly inputsOf: (pkg: WorkspacePackage) => readonly string[];
}

/*
 * mise has no `^` edge, so a dependency-scoped need names each workspace
 * dependency's task outright, skipping dependencies that don't run it, which
 * turbo does implicitly. turbo's `transit` hashes a dependency's tracked
 * files; mise walks a glob fully before applying exclusions and ignores
 * .gitignore, so the rendering lists each dependency's declared inputs
 * instead.
 */
export const miseEdges = (
  needs: readonly Need[],
  pkg: WorkspacePackage,
  { discovery, hasTask, inputsOf }: MiseContext,
): MiseEdges => {
  const deps = workspaceDependencies(pkg, discovery);
  const owners = (scope: Scope): readonly WorkspacePackage[] => (scope === 'self' ? [pkg] : deps);
  const at = (owner: WorkspacePackage, task: string): string =>
    `${projectPath(discovery, owner.dir)}:${task}`;

  return {
    depends: needs.flatMap((need) => {
      switch (need.kind) {
        case 'codegen': {
          return owners(need.scope)
            .filter(owner => owner.generateScripts.length > 0)
            .map(owner => at(owner, Aggregate.generate));
        }
        case 'dependency-sources': {
          return [];
        }
        case 'task': {
          return owners(need.scope)
            .filter(owner => hasTask(need.name, owner))
            .map(owner => at(owner, need.name));
        }
      }
    }),
    sources: needs.some(need => need.kind === 'dependency-sources')
      ? deps.flatMap((dep) => {
          const rel = toPosixRelative(pkg.dir, dep.dir);
          return inputsOf(dep).map(input => (input.startsWith('../')
            ? path.posix.normalize(path.posix.join(rel, input))
            : path.posix.join(rel, input)));
        })
      : [],
  };
};
