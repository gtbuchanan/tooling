import { describe, it } from 'vitest';
import { matchTarball, pinned } from '#src/fixture.js';

describe.concurrent(matchTarball, () => {
  it('matches a scoped package tarball', ({ expect }) => {
    const files = ['gtbuchanan-eslint-config-0.0.0.tgz'];

    expect(matchTarball(files, '@gtbuchanan/eslint-config')).toBe(
      'gtbuchanan-eslint-config-0.0.0.tgz',
    );
  });

  it('does not match a similarly-named package', ({ expect }) => {
    const files = [
      'gtbuchanan-eslint-config-0.0.0.tgz',
      'gtbuchanan-eslint-config-extra-0.0.0.tgz',
    ];

    expect(() => matchTarball(files, '@gtbuchanan/eslint-config-extra')).not.toThrow();
    expect(matchTarball(files, '@gtbuchanan/eslint-config-extra')).toBe(
      'gtbuchanan-eslint-config-extra-0.0.0.tgz',
    );
  });

  it('throws when no tarball matches', ({ expect }) => {
    const files = ['unrelated-0.0.0.tgz'];

    expect(() => matchTarball(files, '@gtbuchanan/eslint-config')).toThrow(
      /found 0/iv,
    );
  });

  it('throws when multiple tarballs match', ({ expect }) => {
    const files = [
      'gtbuchanan-eslint-config-0.0.0.tgz',
      'gtbuchanan-eslint-config-1.0.0.tgz',
    ];

    expect(() => matchTarball(files, '@gtbuchanan/eslint-config')).toThrow(
      /found 2/iv,
    );
  });

  it('ignores non-tgz files', ({ expect }) => {
    const files = [
      'gtbuchanan-eslint-config-0.0.0.tgz',
      'gtbuchanan-eslint-config-0.0.0.tar.gz',
    ];

    expect(matchTarball(files, '@gtbuchanan/eslint-config')).toBe(
      'gtbuchanan-eslint-config-0.0.0.tgz',
    );
  });
});

describe.concurrent(pinned, () => {
  it('resolves installed package to name@version', ({ expect }) => {
    const result = pinned('valibot');

    expect(result).toMatch(/^valibot@\d+\.\d+\.\d+$/v);
  });

  it('throws for unresolvable package', ({ expect }) => {
    expect(() => pinned('nonexistent-pkg-xyz')).toThrow(/nonexistent-pkg-xyz/v);
  });
});
