import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { pklPackage, pklSource } from '#src/toolchains/pkl/capabilities.js';
import { typescript, typescriptSources } from '#src/toolchains/typescript/capabilities.js';
import { vitestE2e, vitestTests } from '#src/toolchains/vitest/capabilities.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

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
});
