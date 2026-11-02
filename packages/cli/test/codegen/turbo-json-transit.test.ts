import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { pklPackage, pklSource } from '#src/toolchains/pkl/capabilities.js';
import { typescript, typescriptSources } from '#src/toolchains/typescript/capabilities.js';
import { vitestE2e, vitestTests } from '#src/toolchains/vitest/capabilities.js';
import { makeDiscovery, makePackage } from '#test/codegen/turbo-config.helpers.js';

describe.concurrent('generateTurboJson (transit)', () => {
  it('includes a self-topological transit node when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([typescript]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['transit']).toStrictEqual({ dependsOn: ['^transit'] });
  });

  it('includes the transit node when Vitest exists without TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([vitestTests]), hasTest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  it('includes the transit node when ESLint exists alone', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  it('includes the transit node for an e2e-only workspace', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([vitestE2e]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  /*
   * A root task reaches the workspace packages the root depends on only
   * through `^transit`; without it, an edit to a root-consumed package (the
   * ESLint config the root lints with) replays the root's cached pass.
   */
  it('//#lint:eslint depends on the root\'s workspace dependencies', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([eslint]) }),
        makePackage({ capabilities: new Set([eslint]) }),
      ],
      { capabilities: new Set([eslint]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['//#lint:eslint']?.dependsOn).toStrictEqual(['^transit']);
  });

  it('//#typecheck:ts depends on the root\'s workspace dependencies', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([typescript]) }), makePackage()],
      { capabilities: new Set([typescript, typescriptSources]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['//#typecheck:ts']?.dependsOn).toStrictEqual(['^transit']);
  });

  it('includes the transit node when only the root lints', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([pklPackage, pklSource]) }),
        makePackage({ capabilities: new Set([pklPackage, pklSource]) }),
      ],
      { capabilities: new Set([eslint]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  it('includes the transit node when only the root type-checks', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([pklPackage, pklSource]) }),
        makePackage({ capabilities: new Set([pklPackage, pklSource]) }),
      ],
      { capabilities: new Set([typescriptSources]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('transit');
  });

  it('excludes the transit node when nothing depends on it', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([pklPackage, pklSource]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('transit');
  });

  it('typecheck:ts depends on transit so dependency sources reach its hash', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([typescript]) }),
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
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toStrictEqual(['transit']);
  });

  it('lint:eslint keeps both edges when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([eslint, typescript]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toStrictEqual(['typecheck:ts', 'transit']);
  });

  it('test:vitest tasks depend on transit', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([vitestTests]), hasTest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:fast']?.dependsOn).toContain('transit');
    expect(result.tasks['test:vitest:slow']?.dependsOn).toContain('transit');
  });

  it('test:vitest tasks gate on the compile aggregate, not the ts leaf', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([vitestTests, published]), hasTest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:fast']?.dependsOn).toStrictEqual(['^compile', 'transit']);
    expect(result.tasks['test:vitest:slow']?.dependsOn).toStrictEqual(['^compile', 'transit']);
  });

  it('omits the compile edge from test:vitest tasks when nothing is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([vitestTests]), hasTest: true }),
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
      makePackage({ capabilities: new Set([vitestE2e, published]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:e2e']?.dependsOn).toStrictEqual(['pack', '^pack', 'transit']);
  });

  it('test:vitest:e2e depends on transit when nothing is published', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([vitestE2e]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['test:vitest:e2e']?.dependsOn).toStrictEqual(['transit']);
  });
});
