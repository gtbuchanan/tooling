import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import type { CliSource } from '#src/core/discovery.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

const rootMiseFiles = ['mise.lock', 'mise.toml'];

const workspaceCli: CliSource = { dir: '/fake/root/tools/cli', kind: 'workspace' };

describe.concurrent('generateTurboJson (globalDependencies)', () => {
  it('emits globalDependencies for every mise file the workspace has', ({ expect }) => {
    const miseFiles = ['.config/mise.lock', '.config/mise.toml', 'mise.toml'];
    const discovery = makeDiscovery([makePackage()], { miseFiles });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual(miseFiles);
  });

  it('omits globalDependencies when the workspace has no mise files', ({ expect }) => {
    const discovery = makeDiscovery([makePackage()]);

    const result = generateTurboJson(discovery);

    expect(result).not.toHaveProperty('globalDependencies');
  });

  /*
   * Self-hosted workspaces vendor tool-config packages (eslint-config,
   * vitest-config) internally, so turbo's lockfile closure never reaches
   * sibling tasks that consume their plugins — the lockfile must salt the
   * global hash. And they run gtb from the CLI's source by relative path,
   * with no dependency edge turbo can follow, so the CLI's sources salt it
   * too. Consumers get those packages externally, where turbo's per-package
   * transitive closure already invalidates correctly.
   */
  it('emits the lockfile and the CLI sources when the CLI is the workspace\'s', ({ expect }) => {
    const discovery = makeDiscovery([makePackage()], { cli: workspaceCli });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual([
      'pnpm-lock.yaml', 'tools/cli/bin/**', 'tools/cli/package.json', 'tools/cli/src/**',
    ]);
  });

  it('emits neither for a CLI the root depends on', ({ expect }) => {
    const discovery = makeDiscovery([makePackage()], {
      cli: { kind: 'dependency' },
      miseFiles: rootMiseFiles,
    });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual(rootMiseFiles);
  });
});
