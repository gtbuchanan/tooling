import { describe, it } from 'vitest';
import {
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

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

    expect(result).toHaveProperty('typecheck:ts', 'pnpm run gtb typecheck:ts');
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

    expect(result).toHaveProperty('check', 'turbo run check');
    expect(result).toHaveProperty('build', 'turbo run build');
    expect(result).toHaveProperty('prepare', 'gtb prepare');
    expect(result).toHaveProperty('turbo:check', 'gtb turbo:check');
  });

  it('generates pack alias when published packages exist', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('pack', 'turbo run pack');
  });

  it('omits pack alias when no published packages', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()]);

    const result = generateRootScripts(discovery);

    expect(result).not.toHaveProperty('pack');
  });
});

describe.concurrent(generateRequiredRootScripts, () => {
  it('returns only prepare and turbo:check regardless of capabilities', ({ expect }) => {
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
      'prepare': 'gtb prepare',
      'turbo:check': 'gtb turbo:check',
    });
  });
});
