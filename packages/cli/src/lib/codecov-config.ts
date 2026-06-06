import path from 'node:path';
import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';
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

const checkForDuplicateBasenames = (names: readonly string[]): void => {
  const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate package directory basenames: ${[...new Set(duplicates)].join(', ')}. ` +
      'Rename conflicting package directories — Codecov uses the basename as the flag name.',
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
    const name = path.basename(pkg.dir);
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
 * Throws if any two coverage packages share the same directory basename,
 * as Codecov uses the basename as the flag name.
 */
export const generateCodecovSections = (discovery: WorkspaceDiscovery): CodecovSections => {
  const coveragePackages = discovery.packages.filter(pkg => pkg.hasVitestTests);
  const names = coveragePackages.map(pkg => path.basename(pkg.dir));
  checkForDuplicateBasenames(names);
  const { flags, components } = buildCoverageEntries(coveragePackages, discovery.rootDir);
  return {
    codecov: codecovSettings,
    component_management: { individual_components: components },
    flags,
  };
};
