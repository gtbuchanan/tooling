import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

const rootMiseFiles = ['mise.lock', 'mise.toml'];

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
   * global hash. Consumers get those packages externally, where turbo's
   * per-package transitive closure already invalidates correctly.
   */
  it('emits the lockfile in globalDependencies when self-hosted', ({ expect }) => {
    const discovery = makeDiscovery([makePackage()], { isSelfHosted: true });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual(['pnpm-lock.yaml']);
  });

  /*
   * Self-hosted packages run gtb from the CLI's source by relative path, with
   * no dependency edge turbo can follow, so the CLI's sources must salt every
   * task explicitly.
   */
  it('emits the vendored CLI sources in globalDependencies when self-hosted', ({ expect }) => {
    const cli = makePackage({
      buildIncludes: ['bin', 'src'],
      dir: '/fake/root/tools/cli',
      name: '@gtbuchanan/cli',
    });
    const discovery = makeDiscovery([cli, makePackage()], { isSelfHosted: true });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual([
      'pnpm-lock.yaml', 'tools/cli/bin/**', 'tools/cli/package.json', 'tools/cli/src/**',
    ]);
  });

  it('normalizes dot-prefixed CLI build includes', ({ expect }) => {
    const cli = makePackage({
      buildIncludes: ['./src'],
      dir: '/fake/root/tools/cli',
      name: '@gtbuchanan/cli',
    });
    const discovery = makeDiscovery([cli, makePackage()], { isSelfHosted: true });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toContain('tools/cli/src/**');
  });

  it('emits mise files and the lockfile when self-hosted with mise.toml', ({ expect }) => {
    const discovery = makeDiscovery([makePackage()], {
      isSelfHosted: true,
      miseFiles: rootMiseFiles,
    });

    const result = generateTurboJson(discovery);

    expect(result.globalDependencies).toStrictEqual([
      'mise.lock', 'mise.toml', 'pnpm-lock.yaml',
    ]);
  });
});
