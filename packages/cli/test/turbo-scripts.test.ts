import { describe, it } from 'vitest';
import type { PackageCapabilities } from '#src/lib/discovery.js';
import {
  forbiddenRootScripts,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

/**
 * Two identical packages — the minimum `makeDiscovery` reads as a monorepo.
 */
const monorepoOf = (
  overrides: Partial<PackageCapabilities> = {},
): readonly PackageCapabilities[] => [
  makeCapabilities(overrides),
  makeCapabilities(overrides),
];

describe.concurrent(generatePackageScripts, () => {
  it('generates typecheck:ts for TypeScript packages', ({ expect }) => {
    const caps = makeCapabilities({ hasTypeScript: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('typecheck:ts', 'gtb task typecheck:ts');
  });

  it('generates compile:ts for published packages', ({ expect }) => {
    const caps = makeCapabilities({ isPublished: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('compile:ts', 'gtb task compile:ts');
  });

  it('generates lint:eslint for ESLint packages', ({ expect }) => {
    const caps = makeCapabilities({ hasEslint: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('lint:eslint', 'gtb task lint:eslint');
  });

  it('generates test:vitest:fast for Vitest + test/ packages', ({ expect }) => {
    const caps = makeCapabilities({ hasTest: true, hasVitest: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('test:vitest:fast', 'gtb task test:vitest:fast');
    expect(result).toHaveProperty('test:vitest:slow', 'gtb task test:vitest:slow');
  });

  it('generates test:vitest:e2e for packages with e2e vitest config', ({ expect }) => {
    const caps = makeCapabilities({ hasVitestE2e: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('test:vitest:e2e', 'gtb task test:vitest:e2e');
  });

  it('generates pkl scripts for Pkl packages', ({ expect }) => {
    const caps = makeCapabilities({ hasPkl: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('typecheck:pkl', 'gtb task typecheck:pkl');
    expect(result).toHaveProperty('pack:pkl', 'gtb task pack:pkl');
  });

  it('omits pack:pkl for an internal Pkl package (no package block)', ({ expect }) => {
    const caps = makeCapabilities({ hasPkl: true, hasPklPackage: false });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('typecheck:pkl', 'gtb task typecheck:pkl');
    expect(result).not.toHaveProperty('pack:pkl');
  });

  it('generates gtb shim for self-hosted packages', ({ expect }) => {
    const caps = makeCapabilities({ dir: '/root/packages/app', hasTypeScript: true });

    const result = generatePackageScripts(caps, true, '/root');

    expect(result).toHaveProperty('typecheck:ts', 'pnpm run gtb task typecheck:ts');
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
  it('includes aliases and required scripts', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({
      hasEslint: true,
      hasTest: true,
      hasTypeScript: true,
      hasVitest: true,
      isPublished: true,
    }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('check', 'gtb turbo run check');
    expect(result).toHaveProperty('build', 'gtb turbo run build');
    expect(result).toHaveProperty('prepare', 'gtb prepare');
    expect(result).toHaveProperty('verify', 'gtb verify');
  });

  it('routes aliases through pnpm run gtb in self-hosted repos', ({ expect }) => {
    const discovery = makeDiscovery(
      monorepoOf({ hasEslint: true, hasTypeScript: true, isPublished: true }),
      { isSelfHosted: true },
    );

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('build', 'pnpm run gtb turbo run build');
    expect(result).toHaveProperty('pack', 'pnpm run gtb turbo run pack');
  });

  it('generates pack alias when published packages exist', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ isPublished: true }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('pack', 'gtb turbo run pack');
  });

  it('omits pack alias when no published packages', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf());

    const result = generateRootScripts(discovery);

    expect(result).not.toHaveProperty('pack');
  });

  it('generates pack and build aliases for a Pkl-only package', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ hasPkl: true }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('pack', 'gtb turbo run pack');
    expect(result).toHaveProperty('build', 'gtb turbo run build');
  });

  it('generates the deploy:skills alias for monorepos with skills', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ hasSkills: true }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('deploy:skills', 'gtb turbo run deploy:skills');
  });

  it('omits every turbo alias in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasPkl: true,
        hasSkills: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
        hasVitestE2e: true,
        isPublished: true,
      }),
    ]);

    const result = generateRootScripts(discovery);

    expect(result).toStrictEqual({ prepare: 'gtb prepare', verify: 'gtb verify' });
  });
});

describe.concurrent(forbiddenRootScripts, () => {
  it('lists the aggregates a single-package repo must not shadow', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
        isPublished: true,
      }),
    ]);

    expect(forbiddenRootScripts(discovery)).toStrictEqual([
      'build', 'build:ci', 'check', 'coverage:merge', 'pack', 'test:slow',
    ]);
  });

  /*
   * deploy:skills is a leaf task, not a command-less aggregate — the root owns
   * its `gtb task` script here, so listing it would make sync and verify
   * contradict each other.
   */
  it('excludes deploy:skills, which the root legitimately owns', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasSkills: true })]);

    expect(forbiddenRootScripts(discovery)).toStrictEqual([]);
  });

  it('lists nothing for monorepos, where the aliases are legitimate', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({
      hasEslint: true,
      hasTest: true,
      hasTypeScript: true,
      hasVitest: true,
      isPublished: true,
    }));

    expect(forbiddenRootScripts(discovery)).toStrictEqual([]);
  });
});

describe.concurrent(generateRequiredRootScripts, () => {
  it('returns only prepare and verify in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasTypeScript: true,
        hasVitest: true,
        isPublished: true,
      }),
    ]);

    const result = generateRequiredRootScripts(discovery);

    expect(result).toStrictEqual({
      prepare: 'gtb prepare',
      verify: 'gtb verify',
    });
  });

  it('adds root lint:eslint when monorepo root has ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasEslint: true }), makeCapabilities({ hasEslint: true })],
      { hasEslint: true },
    );

    const result = generateRequiredRootScripts(discovery);

    expect(result['lint:eslint']).toBe(
      'gtb task lint:eslint . --ignore-pattern "packages/*/**"',
    );
  });

  it('omits root lint:eslint when root has no ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasEslint: true }), makeCapabilities({ hasEslint: true })],
    );

    const result = generateRequiredRootScripts(discovery);

    expect(result).not.toHaveProperty('lint:eslint');
  });
});
