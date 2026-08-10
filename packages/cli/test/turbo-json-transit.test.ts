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

  it('excludes the transit node when nothing depends on it', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasEslint: true })]);

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
});
