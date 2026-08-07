import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';
import { unscopedName } from './manifest.ts';
import { toPosixRelative } from './paths.ts';

/** Codecov per-package flag configuration. */
export interface CodecovFlag {
  /** Carry forward coverage from previous commits when a flag is not uploaded. */
  readonly carryforward: boolean;
  /** Paths scoped to this flag. */
  readonly paths: readonly string[];
}

/** Codecov component definition. */
export interface CodecovComponent {
  /** Stable identifier for the component. */
  readonly component_id: string;
  /** Display name for the component. */
  readonly name: string;
  /** Source file glob patterns for this component. */
  readonly paths: readonly string[];
}

/** Top-level codecov settings managed by tooling. */
export interface CodecovSettings {
  /**
   * Forced false. Coverage here is informational, not a merge gate: the
   * Codecov upload job runs `continue-on-error` (never blocks PRs) and
   * drift self-corrects when release.yml re-runs on main. The default
   * (`require_ci_to_pass: true`) only earns its keep when the Codecov
   * status is itself a gate and you want to avoid acting on coverage from
   * an incomplete CI run. With coverage non-blocking, leaving it true just
   * suppresses the (still useful) coverage status and PR comment whenever
   * an unrelated check fails — e.g. a missing changeset — for no
   * offsetting benefit. False keeps coverage visible regardless of other
   * CI. See README "Coverage".
   */
  readonly require_ci_to_pass: false;
}

/** Derived and managed sections of codecov.yml that gtb sync owns. */
export interface CodecovSections {
  /** Top-level codecov settings (authoritative). */
  readonly codecov: CodecovSettings;
  /** Per-package upload flags. */
  readonly flags: Readonly<Record<string, CodecovFlag>>;
  /** Component management block (only individual_components is generated). */
  readonly component_management: {
    readonly individual_components: readonly CodecovComponent[];
  };
}

/** Tooling-owned top-level codecov settings, written authoritatively by sync. */
export const codecovSettings: CodecovSettings = { require_ci_to_pass: false };

const buildComponentPaths = (
  pkg: PackageCapabilities,
  relDir: string,
): readonly string[] => {
  const paths: string[] = [];
  if (pkg.hasBin) {
    paths.push(`${relDir}/bin/**`);
  }
  if (pkg.hasScripts) {
    paths.push(`${relDir}/scripts/**`);
  }
  paths.push(`${relDir}/src/**`);
  return paths;
};

/**
 * Codecov flag / component name for a package: its unscoped manifest name.
 *
 * Deliberately *not* the directory basename. The basename is a property of
 * the checkout — a worktree or clone renames it — but these names are
 * committed to `codecov.yml`, so a basename-derived name drifts the moment
 * the repo is checked out somewhere else. That bites hardest in a
 * single-package repo, whose sole package is the checkout root itself.
 * A manifest name is the same in every checkout. The scope is stripped
 * because Codecov flag names don't accept `@` or `/`.
 */
export const codecovName = (pkg: PackageCapabilities): string => unscopedName(pkg.name);

/**
 * Unscoped names are unique per package in practice but not by construction —
 * `@a/utils` and `@b/utils` collide once the scope is stripped. Codecov keys
 * flags by name, so the collision would silently merge two packages' coverage.
 */
const checkForDuplicateNames = (names: readonly string[]): void => {
  const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate Codecov flag names: ${[...new Set(duplicates)].join(', ')}. ` +
      'Rename the conflicting packages — Codecov flags use the unscoped package name, ' +
      'so packages that differ only by scope collide.',
    );
  }
};

const buildCoverageEntries = (
  packages: readonly PackageCapabilities[],
  rootDir: string,
): { components: CodecovComponent[]; flags: Record<string, CodecovFlag> } => {
  const flags: Record<string, CodecovFlag> = {};
  const components: CodecovComponent[] = [];
  for (const pkg of packages) {
    const name = codecovName(pkg);
    const relDir = toPosixRelative(rootDir, pkg.dir);
    flags[name] = { carryforward: true, paths: [`${relDir}/`] };
    components.push({ component_id: name, name, paths: buildComponentPaths(pkg, relDir) });
  }
  return { components, flags };
};

/**
 * Generates the managed sections of `codecov.yml`: the authoritative
 * top-level `codecov` settings, plus the derived `flags` and
 * `component_management.individual_components` from workspace discovery.
 * Only packages with Vitest tests (`hasVitestTests`) are included.
 * Throws if any two coverage packages resolve to the same
 * {@link codecovName}.
 */
export const generateCodecovSections = (discovery: WorkspaceDiscovery): CodecovSections => {
  const coveragePackages = discovery.packages.filter(pkg => pkg.hasVitestTests);
  checkForDuplicateNames(coveragePackages.map(codecovName));
  const { flags, components } = buildCoverageEntries(coveragePackages, discovery.rootDir);
  return {
    codecov: codecovSettings,
    component_management: { individual_components: components },
    flags,
  };
};
