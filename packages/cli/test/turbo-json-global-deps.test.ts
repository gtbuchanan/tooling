import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

describe.concurrent('generateTurboJson (globalDependencies)', () => {
  it('emits globalDependencies for mise files when the workspace has mise.toml', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()], { hasMise: true });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual(['mise.lock', 'mise.toml']);
  });

  it('omits globalDependencies when the workspace has no mise.toml', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()]);

    const result = generateTurboJson(discovery);

    expect(result).not.toHaveProperty('globalDependencies');
  });

  /*
   * Self-hosted workspaces vendor tool-config packages (eslint-config,
   * vitest-config) internally, so turbo's lockfile closure never reaches
   * sibling tasks that consume their plugins — the lockfile must salt the
   * global hash. Consumers get those packages externally, where turbo's
   * per-package transitive closure already invalidates correctly.
   */
  it('emits the lockfile in globalDependencies when self-hosted', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()], { isSelfHosted: true });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual(['pnpm-lock.yaml']);
  });

  it('emits mise files and the lockfile when self-hosted with mise.toml', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()], {
      hasMise: true,
      isSelfHosted: true,
    });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual([
      'mise.lock', 'mise.toml', 'pnpm-lock.yaml',
    ]);
  });
});
