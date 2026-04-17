import path from 'node:path';
import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';

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

/** Derived sections of codecov.yml that are generated from workspace discovery. */
export interface CodecovSections {
  /** Per-package upload flags. */
  readonly flags: Readonly<Record<string, CodecovFlag>>;
  /** Component management block (only individual_components is generated). */
  readonly component_management: {
    readonly individual_components: readonly CodecovComponent[];
  };
}

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
    const relDir = path.relative(rootDir, pkg.dir).replaceAll('\\', '/');
    flags[name] = { carryforward: true, paths: [`${relDir}/`] };
    components.push({ component_id: name, name, paths: buildComponentPaths(pkg, relDir) });
  }
  return { components, flags };
};

/**
 * Generates the derived `flags` and `component_management.individual_components`
 * sections of `codecov.yml` from workspace discovery.
 * Only packages with Vitest tests (`hasVitestTests`) are included.
 * Throws if any two coverage packages share the same directory basename,
 * as Codecov uses the basename as the flag name.
 */
export const generateCodecovSections = (discovery: WorkspaceDiscovery): CodecovSections => {
  const coveragePackages = discovery.packages.filter(pkg => pkg.hasVitestTests);
  const names = coveragePackages.map(pkg => path.basename(pkg.dir));
  checkForDuplicateBasenames(names);
  const { flags, components } = buildCoverageEntries(coveragePackages, discovery.rootDir);
  return { component_management: { individual_components: components }, flags };
};
