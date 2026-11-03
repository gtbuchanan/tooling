import { describe, it } from 'vitest';
import {
  generatePackageScripts, generateRootScripts, generateTurboJson,
} from '#src/codegen/turbo-config.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { vitestE2e, vitestTests } from '#src/toolchains/vitest/capabilities.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

describe.concurrent(generateTurboJson, () => {
  it('includes test:vitest:fast when any package has Vitest + test/', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([vitestTests]), hasTest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('test:vitest:fast');
  });

  it('omits test:vitest:e2e when only a monorepo root has e2e config', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([published]) })],
      { capabilities: new Set([vitestE2e]), isMonorepo: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('test:vitest:e2e');
    expect(result.tasks).not.toHaveProperty('test:e2e');
    expect(result.tasks['build']?.dependsOn).not.toContain('test:e2e');
    expect(generateRootScripts(discovery)).not.toHaveProperty('test:e2e');
  });

  it('test:vitest:fast inputs match all vitest configs except e2e', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([vitestTests]), hasTest: true }),
    ]);

    const result = generateTurboJson(discovery);
    const inputs = result.tasks['test:vitest:fast']?.inputs ?? [];

    expect(inputs).toStrictEqual(expect.arrayContaining([
      'vitest.config.*', '!vitest.config.e2e.*',
    ]));
  });

  it('test:vitest:slow inputs match all vitest configs except e2e', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([vitestTests]), hasTest: true }),
    ]);

    const result = generateTurboJson(discovery);
    const inputs = result.tasks['test:vitest:slow']?.inputs ?? [];

    expect(inputs).toStrictEqual(expect.arrayContaining([
      'vitest.config.*', '!vitest.config.e2e.*',
    ]));
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

describe.concurrent(generatePackageScripts, () => {
  it('generates test:vitest:fast for Vitest + test/ packages', ({ expect }) => {
    const caps = makePackage({ capabilities: new Set([vitestTests]), hasTest: true });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('test:vitest:fast', 'gtb task test:vitest:fast');
    expect(result).toHaveProperty('test:vitest:slow', 'gtb task test:vitest:slow');
  });

  it('generates test:vitest:e2e for packages with e2e vitest config', ({ expect }) => {
    const caps = makePackage({ capabilities: new Set([vitestE2e]) });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('test:vitest:e2e', 'gtb task test:vitest:e2e');
  });
});
