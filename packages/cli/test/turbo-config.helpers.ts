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

export const makeDiscovery = (
  packages: readonly PackageCapabilities[],
  rootOverrides: Partial<PackageCapabilities> = {},
): WorkspaceDiscovery => ({
  isMonorepo: packages.length > 1,
  isSelfHosted: false,
  packages,
  root: makeCapabilities(rootOverrides),
  rootDir: '/fake/root',
});
