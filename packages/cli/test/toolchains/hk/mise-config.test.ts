import { describe, it } from 'vitest';
import { hkMiseConfig } from '#src/toolchains/hk/mise-config.js';

const root = { hkFiles: ['hk.pkl'] };

describe.concurrent(hkMiseConfig, () => {
  it('runs gtb through pnpm exec in a repo depending on the CLI', ({ expect }) => {
    const config = hkMiseConfig({ cli: { kind: 'dependency' }, root });

    expect(config?.tasks).toMatchObject({
      'hk:all': { run: 'pnpm exec gtb hk all' },
      'hk:base': { run: 'pnpm exec gtb hk base' },
    });
  });

  it('uses the gtb script shim when the CLI is the workspace\'s', ({ expect }) => {
    const config = hkMiseConfig({ cli: { dir: '/fake/root/cli', kind: 'workspace' }, root });

    expect(config?.tasks).toMatchObject({
      'hk:all': { run: 'pnpm run gtb hk all' },
      'hk:base': { run: 'pnpm run gtb hk base' },
    });
  });

  it('uses bare gtb (mise npm: backend) for an hk-only adopter', ({ expect }) => {
    const config = hkMiseConfig({ cli: { kind: 'path' }, root });

    expect(config?.tasks).toMatchObject({
      'hk:all': { run: 'gtb hk all' },
      'hk:base': { run: 'gtb hk base' },
    });
  });

  it('contributes nothing to a repo without an hk config', ({ expect }) => {
    expect(hkMiseConfig({ cli: { kind: 'dependency' }, root: { hkFiles: [] } })).toBeUndefined();
  });
});
