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
    hasScripts: false,
    hasSkills: false,
    hasTest: false,
    hasTypeScript: false,
    hasVitest: false,
    hasVitestE2e: false,
    hasVitestTests: false,
    isPublished: false,
    ...overrides,
  };
  return {
    ...merged,
    hasGenerate: overrides.hasGenerate ?? merged.generateScripts.length > 0,
    hasVitestTests: overrides.hasVitestTests ?? (merged.hasVitest && merged.hasTest),
  };
};

export interface MakeDiscoveryOverrides extends Partial<PackageCapabilities> {
  /** Overrides {@link WorkspaceDiscovery.isSelfHosted} (defaults to `false`). */
  readonly isSelfHosted?: boolean;
}

export const makeDiscovery = (
  packages: readonly PackageCapabilities[],
  overrides: MakeDiscoveryOverrides = {},
): WorkspaceDiscovery => {
  const { isSelfHosted = false, ...rootOverrides } = overrides;
  return {
    isMonorepo: packages.length > 1,
    isSelfHosted,
    packages,
    packageGlobs: packages.length > 1 ? ['packages/*'] : [],
    root: makeCapabilities(rootOverrides),
    rootDir: '/fake/root',
  };
};
