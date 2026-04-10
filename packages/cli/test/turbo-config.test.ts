import { describe, it } from 'vitest';
import type { PackageCapabilities, WorkspaceDiscovery } from '#src/lib/discovery.js';
import {
  generatePackageScripts,
  generateRootScripts,
  generateTurboJson,
} from '#src/lib/turbo-config.js';

const makeCapabilities = (
  overrides: Partial<PackageCapabilities> = {},
): PackageCapabilities => {
  const merged = {
    dir: '/fake/pkg',
    hasE2e: false,
    hasEslint: false,
    hasOxlint: false,
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
    hasVitestTests: overrides.hasVitestTests ?? (merged.hasVitest && merged.hasTest),
  };
};

const makeDiscovery = (
  packages: readonly PackageCapabilities[],
  rootOverrides: Partial<PackageCapabilities> = {},
): WorkspaceDiscovery => ({
  isMonorepo: packages.length > 1,
  isSelfHosted: false,
  packages,
  root: makeCapabilities(rootOverrides),
  rootDir: '/fake/root',
});

describe.concurrent(generateTurboJson, () => {
  it('includes typecheck:ts when any package has TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('typecheck:ts');
  });

  it('excludes typecheck:ts when no package has TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('typecheck:ts');
  });

  it('includes compile:ts when any package is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('compile:ts');
  });

  it('includes lint:eslint when any package has ESLint', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('lint:eslint');
  });

  it('lint:eslint includes root config in inputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);
    const task = result.tasks['lint:eslint'];

    expect(task?.inputs).toContain('$TURBO_ROOT$/eslint.config.*');
  });

  it('lint:eslint includes eslint cache in outputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);
    const task = result.tasks['lint:eslint'];

    expect(task?.outputs).toContain('dist/.eslintcache');
  });

  it('includes lint:oxlint when any package has oxlint', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasOxlint: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('lint:oxlint');
  });

  it('includes test:vitest:fast when any package has Vitest + test/', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('test:vitest:fast');
  });

  it('excludes test:vitest:fast when Vitest exists but no test/', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('test:vitest:fast');
  });

  it('includes test:vitest:e2e when root has e2e config', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities()],
      { hasVitestE2e: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('test:vitest:e2e');
  });

  it('includes //#pack when any package is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('//#pack');
  });

  it('prunes typecheck:ts from lint dependsOn when no TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);
    const lintEslint = result.tasks['lint:eslint'];

    expect(lintEslint?.dependsOn).not.toContain('typecheck:ts');
  });

  it('includes typecheck:ts in lint dependsOn when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true, hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);
    const lintEslint = result.tasks['lint:eslint'];

    expect(lintEslint?.dependsOn).toContain('typecheck:ts');
  });

  it('generates check aggregate with discovered leaf tasks', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasOxlint: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['check']?.dependsOn).toContain('lint');
    expect(result.tasks['check']?.dependsOn).toContain('test:vitest:fast');
  });

  it('generates lint aggregate from discovered linters', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true, hasOxlint: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint']?.dependsOn).toContain('lint:eslint');
    expect(result.tasks['lint']?.dependsOn).toContain('lint:oxlint');
  });

  it('omits lint aggregate when no linters', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasTypeScript: true })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('lint');
  });

  it('generates build:ci with compile + check + pack', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasOxlint: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
        isPublished: true,
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['build:ci']?.dependsOn).toContain('check');
    expect(result.tasks['build:ci']?.dependsOn).toContain('compile:ts');
    expect(result.tasks['build:ci']?.dependsOn).toContain('//#pack');
  });

  it('has $schema field', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasTypeScript: true })]);

    const result = generateTurboJson(discovery);

    expect(result.$schema).toBe('https://turbo.build/schema.json');
  });
});

describe.concurrent(generatePackageScripts, () => {
  it('generates typecheck:ts for TypeScript packages', ({ expect }) => {
    const caps = makeCapabilities({ hasTypeScript: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('typecheck:ts', 'gtb typecheck:ts');
  });

  it('generates compile:ts for published packages', ({ expect }) => {
    const caps = makeCapabilities({ isPublished: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('compile:ts', 'gtb compile:ts');
  });

  it('generates lint:eslint for ESLint packages', ({ expect }) => {
    const caps = makeCapabilities({ hasEslint: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('lint:eslint', 'gtb lint:eslint');
  });

  it('generates test:vitest:fast for Vitest + test/ packages', ({ expect }) => {
    const caps = makeCapabilities({ hasTest: true, hasVitest: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('test:vitest:fast', 'gtb test:vitest:fast');
    expect(result).toHaveProperty('test:vitest:slow', 'gtb test:vitest:slow');
  });

  it('generates gtb shim for self-hosted packages', ({ expect }) => {
    const caps = makeCapabilities({ dir: '/root/packages/app', hasTypeScript: true });

    const result = generatePackageScripts(caps, true, '/root');

    expect(result).toHaveProperty('typecheck:ts', 'gtb typecheck:ts');
    expect(result['gtb']).toContain('node --experimental-strip-types');
    expect(result['gtb']).toContain('packages/cli/bin/gtb.ts');
  });

  it('generates nothing for empty capabilities', ({ expect }) => {
    const caps = makeCapabilities();

    const result = generatePackageScripts(caps, false);

    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe.concurrent(generateRootScripts, () => {
  it('generates turbo run check', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
      }),
    ]);

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('check', 'turbo run check');
  });

  it('generates turbo run build', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
        isPublished: true,
      }),
    ]);

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('build', 'turbo run build');
  });

  it('generates pack script when published packages exist', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('pack', 'gtb pack');
  });

  it('omits pack when no published packages', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()]);

    const result = generateRootScripts(discovery);

    expect(result).not.toHaveProperty('pack');
  });

  it('always generates prepare', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()]);

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('prepare', 'gtb prepare');
  });
});
