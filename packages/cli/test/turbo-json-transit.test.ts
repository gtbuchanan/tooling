import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

describe.concurrent('generateTurboJson (transit)', () => {
  it('includes a self-topological transit node when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['transit']).toStrictEqual({ dependsOn: ['^transit'] });
  });

  it('includes the transit node when Vitest exists without TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  it('includes the transit node when ESLint exists alone', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasEslint: true })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  it('includes the transit node for an e2e-only workspace', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasVitestE2e: true })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  it('excludes the transit node when nothing depends on it', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasPkl: true })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('transit');
  });

  it('typecheck:ts depends on transit so dependency sources reach its hash', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck:ts']?.dependsOn).toContain('transit');
  });

  /*
   * lint:eslint would otherwise inherit the propagation through its
   * same-package typecheck:ts dep — an edge consumers are told they may drop,
   * and one that isn't generated at all without TypeScript.
   */
  it('lint:eslint depends on transit with no typecheck:ts to inherit from', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasEslint: true })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toStrictEqual(['transit']);
  });

  it('lint:eslint keeps both edges when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true, hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toStrictEqual(['typecheck:ts', 'transit']);
  });

  it('test:vitest tasks depend on transit', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:fast']?.dependsOn).toContain('transit');
    expect(result.tasks['test:vitest:slow']?.dependsOn).toContain('transit');
  });

  it('test:vitest tasks gate on the compile aggregate, not the ts leaf', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true, isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:fast']?.dependsOn).toStrictEqual(['^compile', 'transit']);
    expect(result.tasks['test:vitest:slow']?.dependsOn).toStrictEqual(['^compile', 'transit']);
  });

  it('omits the compile edge from test:vitest tasks when nothing is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:fast']?.dependsOn).toStrictEqual(['transit']);
  });

  /*
   * `^pack` covers a source-only dependency only incidentally — a dependency
   * with no `pack:npm` script leaves `pack` scriptless and inputs-less, so it
   * hashes the whole package the way `transit` does. That coverage reaches
   * direct dependencies only, and disappears entirely when nothing is packed.
   */
  it('test:vitest:e2e depends on transit alongside its pack edges', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasVitestE2e: true, isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:e2e']?.dependsOn).toStrictEqual(['pack', '^pack', 'transit']);
  });

  it('test:vitest:e2e depends on transit when nothing is published', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasVitestE2e: true })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:e2e']?.dependsOn).toStrictEqual(['transit']);
  });
});
