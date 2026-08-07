import type { PackageCapabilities, WorkspaceDiscovery } from '#src/lib/discovery.js';
import { buildInclude } from '#src/lib/tsconfig-gen.js';

export const makeCapabilities = (
  overrides: Partial<PackageCapabilities> = {},
): PackageCapabilities => {
  const merged = {
    buildIncludes: [...buildInclude] as readonly string[],
    dir: '/fake/pkg',
    generateScripts: [] as readonly string[],
    hasBin: false,
    hasE2e: false,
    hasEslint: false,
    hasGenerate: false,
    hasPkl: false,
    hasPklPackage: false,
    hasScripts: false,
    hasSkills: false,
    hasTest: false,
    hasTypeScript: false,
    hasVitest: false,
    hasVitestE2e: false,
    hasVitestTests: false,
    isPublished: false,
    name: 'pkg',
    ...overrides,
  };
  return {
    ...merged,
    hasGenerate: overrides.hasGenerate ?? merged.generateScripts.length > 0,
    // A Pkl package is publishable by default in fixtures; override to false
    // for the internal (block-less PklProject) case.
    hasPklPackage: overrides.hasPklPackage ?? merged.hasPkl,
    hasVitestTests: overrides.hasVitestTests ?? (merged.hasVitest && merged.hasTest),
  };
};

export interface MakeDiscoveryOverrides extends Partial<PackageCapabilities> {
  /** Overrides {@link WorkspaceDiscovery.dependsOnCli} (defaults to `false`). */
  readonly dependsOnCli?: boolean;
  /** Overrides {@link WorkspaceDiscovery.hasMise} (defaults to `false`). */
  readonly hasMise?: boolean;
  /**
   * Overrides {@link WorkspaceDiscovery.isMonorepo} (defaults to more than
   * one package). Real discovery also reports a monorepo for a single
   * package under a `packages/*` glob, which no package count can express.
   */
  readonly isMonorepo?: boolean;
  /** Overrides {@link WorkspaceDiscovery.isSelfHosted} (defaults to `false`). */
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
