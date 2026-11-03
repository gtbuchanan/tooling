import { describe, it } from 'vitest';
import {
  forbiddenRootScripts,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from '#src/codegen/turbo-config.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { pklPackage, pklSource } from '#src/toolchains/pkl/capabilities.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { typescript } from '#src/toolchains/typescript/capabilities.js';
import { vitestE2e, vitestTests } from '#src/toolchains/vitest/capabilities.js';
import { makeDiscovery, makePackage, monorepoOf } from '#test/helpers.js';

describe.concurrent(generatePackageScripts, () => {
  it('generates gtb shim for self-hosted packages', ({ expect }) => {
    const caps = makePackage({
      capabilities: new Set([typescript]), dir: '/root/packages/app',
    });

    const result = generatePackageScripts(caps, true, '/root/packages/cli');

    expect(result).toHaveProperty('typecheck:ts', 'pnpm run gtb task typecheck:ts');
    expect(result).toHaveProperty('gtb', 'node ../cli/bin/gtb.ts');
  });

  it('points the gtb shim at the CLI wherever the workspace keeps it', ({ expect }) => {
    const caps = makePackage({ dir: '/root/packages/app' });

    const result = generatePackageScripts(caps, true, '/root/tools/gtb');

    expect(result).toHaveProperty(
      'gtb', 'node ../../tools/gtb/bin/gtb.ts',
    );
  });

  it('points the CLI package\'s own gtb shim at its bin', ({ expect }) => {
    const caps = makePackage({ dir: '/root/tools/gtb' });

    const result = generatePackageScripts(caps, true, '/root/tools/gtb');

    expect(result).toHaveProperty('gtb', 'node bin/gtb.ts');
  });

  it('generates nothing for empty capabilities', ({ expect }) => {
    const caps = makePackage();

    const result = generatePackageScripts(caps, false);

    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe.concurrent(generateRootScripts, () => {
  it('includes aliases and required scripts', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({
      capabilities: new Set([eslint, typescript, vitestTests, published]),
      hasTest: true,
    }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('check', 'gtb turbo run check');
    expect(result).toHaveProperty('build', 'gtb turbo run build');
    expect(result).toHaveProperty('prepare', 'gtb prepare');
    expect(result).toHaveProperty('verify', 'gtb verify');
  });

  it('routes aliases through pnpm run gtb in self-hosted repos', ({ expect }) => {
    const discovery = makeDiscovery(
      monorepoOf({ capabilities: new Set([eslint, typescript, published]) }),
      { isSelfHosted: true },
    );

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('build', 'pnpm run gtb turbo run build');
    expect(result).toHaveProperty('pack', 'pnpm run gtb turbo run pack');
  });

  it('generates pack alias when published packages exist', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ capabilities: new Set([published]) }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('pack', 'gtb turbo run pack');
  });

  it('omits pack alias when no published packages', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf());

    const result = generateRootScripts(discovery);

    expect(result).not.toHaveProperty('pack');
  });

  it('generates pack and build aliases for a Pkl-only package', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ capabilities: new Set([pklSource, pklPackage]) }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('pack', 'gtb turbo run pack');
    expect(result).toHaveProperty('build', 'gtb turbo run build');
  });

  it('generates the deploy:skills alias for monorepos with skills', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ capabilities: new Set([skills]) }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('deploy:skills', 'gtb turbo run deploy:skills');
  });

  it('generates the build alias when only deploy:skills builds', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ capabilities: new Set([skills]) }));

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('build', 'gtb turbo run build');
  });

  /*
   * Turbo dispatches `//#deploy:skills` through the root script of that name,
   * so the root can't also carry the alias — it would re-enter turbo.
   */
  it('omits the deploy:skills alias when the root owns the leaf', ({ expect }) => {
    const discovery = makeDiscovery(
      monorepoOf({ capabilities: new Set([skills]) }),
      { capabilities: new Set([skills]) },
    );

    const result = generateRootScripts(discovery);

    expect(result).toHaveProperty('deploy:skills', 'gtb task deploy:skills');
  });

  it('omits every turbo alias in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({
        capabilities: new Set([
          eslint, pklPackage, pklSource, published, skills, typescript, vitestE2e, vitestTests,
        ]),
        hasTest: true,
      }),
    ]);

    const result = generateRootScripts(discovery);

    expect(result).toStrictEqual({ prepare: 'gtb prepare', verify: 'gtb verify' });
  });
});

describe.concurrent(forbiddenRootScripts, () => {
  it('lists the aggregates a single-package repo must not shadow', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({
        capabilities: new Set([eslint, typescript, vitestTests, published]),
        hasTest: true,
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
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([skills]) })]);

    expect(forbiddenRootScripts(discovery)).toStrictEqual(['build']);
  });

  it('lists nothing for monorepos, where the aliases are legitimate', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({
      capabilities: new Set([eslint, typescript, vitestTests, published]),
      hasTest: true,
    }));

    expect(forbiddenRootScripts(discovery)).toStrictEqual([]);
  });
});

describe.concurrent(generateRequiredRootScripts, () => {
  it('returns only prepare and verify in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({
        capabilities: new Set([eslint, typescript, published]),
      }),
    ]);

    const result = generateRequiredRootScripts(discovery);

    expect(result).toStrictEqual({
      prepare: 'gtb prepare',
      verify: 'gtb verify',
    });
  });
});
