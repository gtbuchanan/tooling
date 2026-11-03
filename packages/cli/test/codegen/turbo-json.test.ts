import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { typescript } from '#src/toolchains/typescript/capabilities.js';
import { vitestTests } from '#src/toolchains/vitest/capabilities.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

describe.concurrent(generateTurboJson, () => {
  /*
   * Packages fill in their own leaves; the root only chains codegen through
   * dependencies, so a package without codegen still passes it along.
   */
  it('chains the monorepo generate aggregate through dependencies', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ generateScripts: ['generate:prisma'] })],
      { isMonorepo: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['generate']).toStrictEqual({ dependsOn: ['^generate'] });
  });

  it('omits generate leaf tasks from a monorepo root', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ generateScripts: ['generate:prisma'] }),
        makePackage({ generateScripts: ['generate:paraglide'] }),
      ],
      { isMonorepo: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('generate:prisma');
    expect(result.tasks).not.toHaveProperty('generate:paraglide');
  });

  it('wires generate leaves into the aggregate for a single-package repo', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ generateScripts: ['generate:paraglide', 'generate:prisma'] })],
      { isMonorepo: false },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['generate']?.dependsOn).toStrictEqual([
      'generate:paraglide',
      'generate:prisma',
    ]);
  });

  it('defines single-package generate leaves as uncached', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ generateScripts: ['generate:prisma'] })],
      { isMonorepo: false },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['generate:prisma']).toStrictEqual({ cache: false });
  });

  it('omits generate aggregate when no packages have generate scripts', ({ expect }) => {
    const discovery = makeDiscovery([makePackage()]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('generate');
  });

  it('generates check aggregate with discovered leaf tasks', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({
        capabilities: new Set([eslint, typescript, vitestTests]),
        hasTest: true,
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['check']?.dependsOn).toContain('lint');
    expect(result.tasks['check']?.dependsOn).toContain('test:vitest:fast');
  });

  it('generates lint aggregate from discovered linters', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint']?.dependsOn).toContain('lint:eslint');
  });

  it('omits lint aggregate when no linters', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([typescript]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('lint');
  });

  it('generates build:ci with compile + check + pack', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({
        capabilities: new Set([eslint, typescript, vitestTests, published]),
        hasTest: true,
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['build:ci']?.dependsOn).toContain('check');
    expect(result.tasks['build:ci']?.dependsOn).toContain('compile');
    expect(result.tasks['build:ci']?.dependsOn).toContain('pack');
  });

  it('has $schema field', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([typescript]) })]);

    const result = generateTurboJson(discovery);

    expect(result.$schema).toBe('https://turbo.build/schema.json');
  });
});
