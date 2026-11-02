import type { Capability } from '#src/core/capability.js';
import type { PackageCapabilities, WorkspaceDiscovery } from '#src/core/discovery.js';
import { buildInclude } from '#src/core/layout.js';

export const makeCapabilities = (
  overrides: Partial<PackageCapabilities> = {},
): PackageCapabilities => {
  const merged = {
    buildIncludes: [...buildInclude] as readonly string[],
    capabilities: new Set<Capability>(),
    dir: '/fake/pkg',
    generateScripts: [] as readonly string[],
    hasBin: false,
    hasE2e: false,
    hasGenerate: false,
    hasScripts: false,
    hasSkills: false,
    hasSrc: false,
    hasTest: false,
    isPublished: false,
    name: 'pkg',
    workspaceDependencies: [] as readonly string[],
    ...overrides,
  };
  return {
    ...merged,
    hasGenerate: overrides.hasGenerate ?? merged.generateScripts.length > 0,
  };
};

export interface MakeDiscoveryOverrides extends Partial<PackageCapabilities> {
  /**
   * Overrides {@link WorkspaceDiscovery.dependsOnCli} (defaults to `false`).
   */
  readonly dependsOnCli?: boolean;
  /**
   * Overrides {@link WorkspaceDiscovery.hasMise} (defaults to `false`).
   */
  readonly hasMise?: boolean;
  /**
   * Overrides {@link WorkspaceDiscovery.isMonorepo} (defaults to more than
   * one package). Real discovery also reports a monorepo for a single
   * package under a `packages/*` glob, which no package count can express.
   */
  readonly isMonorepo?: boolean;
  /**
   * Overrides {@link WorkspaceDiscovery.isSelfHosted} (defaults to `false`).
   */
  readonly isSelfHosted?: boolean;
}

export const makeDiscovery = (
  packages: readonly PackageCapabilities[],
  overrides: MakeDiscoveryOverrides = {},
): WorkspaceDiscovery => {
  const {
    dependsOnCli: hasCliDependency = false,
    hasMise = false,
    isMonorepo = packages.length > 1,
    isSelfHosted = false,
    ...rootOverrides
  } = overrides;
  return {
    dependsOnCli: hasCliDependency,
    hasMise,
    isMonorepo,
    isSelfHosted,
    packages,
    packageGlobs: isMonorepo ? ['packages/*'] : [],
    root: makeCapabilities(rootOverrides),
    rootDir: '/fake/root',
  };
};
