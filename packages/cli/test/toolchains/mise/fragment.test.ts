import { parse as parseToml } from 'smol-toml';
import { describe, it } from 'vitest';
import type { HkMiseInput } from '#src/toolchains/hk/mise-config.js';
import { generateMiseFragment } from '#src/toolchains/mise/fragment.js';

const withHk: HkMiseInput = {
  cli: { kind: 'dependency' },
  root: { hkFiles: ['.config/hk.pkl'] },
};
const withoutHk: HkMiseInput = { ...withHk, root: { hkFiles: [] } };

describe.concurrent(generateMiseFragment, () => {
  it.for([
    ['with', withHk],
    ['without', withoutHk],
  ] as const)('sets the shared settings in a repo %s hk', ([, discovery], { expect }) => {
    const parsed = parseToml(generateMiseFragment(discovery));

    expect(parsed).toMatchObject({
      env: { DO_NOT_TRACK: '1' },
      min_version: '2026.9.16',
      settings: {
        lockfile: true,
        minimum_release_age: '3d',
        minimum_release_age_excludes: ['github:gtbuchanan/*', 'npm:@gtbuchanan/*'],
      },
    });
  });

  // Formatted as the pre-commit TOML formatter wants, so it never fights sync
  it('writes an array with no padding inside its brackets', ({ expect }) => {
    expect(generateMiseFragment(withoutHk)).toContain(
      'minimum_release_age_excludes = ["github:gtbuchanan/*", "npm:@gtbuchanan/*"]\n',
    );
  });

  it('wires hk into mise in a repo with an hk config', ({ expect }) => {
    const parsed = parseToml(generateMiseFragment(withHk));

    expect(parsed).toMatchObject({
      env: { HK_MISE: '1' },
      hooks: { postinstall: 'hk install --mise' },
      tasks: {
        'hk:all': { run: 'pnpm exec gtb hk all' },
        'hk:base': { run: 'pnpm exec gtb hk base' },
      },
    });
  });

  it('leaves hk out of a repo without an hk config', ({ expect }) => {
    // Cloned into plain objects: smol-toml builds null-prototype tables
    const parsed = structuredClone(parseToml(generateMiseFragment(withoutHk)));

    expect(parsed).toStrictEqual({
      env: { DO_NOT_TRACK: '1' },
      min_version: '2026.9.16',
      settings: {
        lockfile: true,
        minimum_release_age: '3d',
        minimum_release_age_excludes: ['github:gtbuchanan/*', 'npm:@gtbuchanan/*'],
      },
    });
  });
});
