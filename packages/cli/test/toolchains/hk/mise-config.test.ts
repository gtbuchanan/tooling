import { describe, it } from 'vitest';
import { hkMiseConfig } from '#src/toolchains/hk/mise-config.js';

const hkFiles = ['hk.pkl'];

describe.concurrent(hkMiseConfig, () => {
  it('runs gtb through pnpm exec in a repo depending on the CLI', ({ expect }) => {
    const config = hkMiseConfig({ dependsOnCli: true, hkFiles, isSelfHosted: false });

    expect(config?.tasks).toMatchObject({
      'hk:all': { run: 'pnpm exec gtb hk all' },
      'hk:base': { run: 'pnpm exec gtb hk base' },
    });
  });

  it('uses the gtb script shim when self-hosted', ({ expect }) => {
    const config = hkMiseConfig({ dependsOnCli: true, hkFiles, isSelfHosted: true });

    expect(config?.tasks).toMatchObject({
      'hk:all': { run: 'pnpm run gtb hk all' },
      'hk:base': { run: 'pnpm run gtb hk base' },
    });
  });

  it('uses bare gtb (mise npm: backend) for an hk-only adopter', ({ expect }) => {
    const config = hkMiseConfig({ dependsOnCli: false, hkFiles, isSelfHosted: false });

    expect(config?.tasks).toMatchObject({
      'hk:all': { run: 'gtb hk all' },
      'hk:base': { run: 'gtb hk base' },
    });
  });

  it('contributes nothing to a repo without an hk config', ({ expect }) => {
    expect(hkMiseConfig({ dependsOnCli: true, hkFiles: [], isSelfHosted: false }))
      .toBeUndefined();
  });
});
