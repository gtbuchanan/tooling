import path from 'node:path';
import { describe, it } from 'vitest';
import {
  termuxShimDirectory,
  turboEnv,
  withAbsolutePathEntries,
  withPathEntryFirst,
} from '#src/toolchains/turbo/commands/turbo.js';

const cwd = path.resolve('/repo');
const join = (...segments: readonly string[]): string => path.join(cwd, ...segments);
const entriesOf = (value = ''): readonly string[] => value.split(path.delimiter);
const missing = (): string => {
  throw Object.assign(new Error('Cannot find module'), { code: 'MODULE_NOT_FOUND' });
};

describe.concurrent(withAbsolutePathEntries, () => {
  it('resolves a relative entry against the given directory', ({ expect }) => {
    const env = withAbsolutePathEntries({ PATH: './node_modules/.bin' }, cwd);

    expect(env).toHaveProperty('PATH', join('node_modules', '.bin'));
  });

  it('leaves absolute entries untouched and preserves order', ({ expect }) => {
    const usrBin = path.resolve('/usr/bin');
    const value = ['./node_modules/.bin', usrBin].join(path.delimiter);

    const env = withAbsolutePathEntries({ PATH: value }, cwd);

    expect(entriesOf(env['PATH'])).toStrictEqual([join('node_modules', '.bin'), usrBin]);
  });

  it('resolves parent-relative entries', ({ expect }) => {
    const env = withAbsolutePathEntries({ PATH: '../shared/bin' }, cwd);

    expect(env).toHaveProperty('PATH', path.resolve(cwd, '..', 'shared', 'bin'));
  });

  /*
   * POSIX reads an empty entry as the current directory, which carries
   * the same cwd-sensitivity as `./x` — so it resolves too.
   */
  it('resolves an empty entry to the given directory', ({ expect }) => {
    const usrBin = path.resolve('/usr/bin');

    const env = withAbsolutePathEntries({ PATH: `${usrBin}${path.delimiter}` }, cwd);

    expect(entriesOf(env['PATH'])).toStrictEqual([usrBin, cwd]);
  });

  it('preserves other environment variables', ({ expect }) => {
    const env = withAbsolutePathEntries({ PATH: './bin', TURBO_TELEMETRY_DISABLED: '1' }, cwd);

    expect(env).toHaveProperty('TURBO_TELEMETRY_DISABLED', '1');
  });

  it('returns the environment unchanged when no PATH is set', ({ expect }) => {
    const env = withAbsolutePathEntries({ HOME: '/home/user' }, cwd);

    expect(env).toStrictEqual({ HOME: '/home/user' });
  });

  /*
   * A key present with no value is as unset as a missing one. Splitting
   * nothing would yield one empty entry, which resolves to the directory
   * and hands turbo a PATH holding only that.
   */
  it('returns the environment unchanged when PATH has no value', ({ expect }) => {
    const env = withAbsolutePathEntries({ HOME: '/home/user', PATH: undefined }, cwd);

    expect(env).toStrictEqual({ HOME: '/home/user', PATH: undefined });
  });

  /*
   * Windows spells the variable `Path`. Writing a second `PATH` key
   * would leave the child with two competing definitions, so the
   * original casing is rewritten in place.
   */
  it('rewrites the existing key casing rather than adding a duplicate', ({ expect }) => {
    const env = withAbsolutePathEntries({ Path: './bin' }, cwd);

    expect(env).toStrictEqual({ Path: join('bin') });
  });

  it('does not mutate the source environment', ({ expect }) => {
    const source = { PATH: './bin' };

    withAbsolutePathEntries(source, cwd);

    expect(source).toStrictEqual({ PATH: './bin' });
  });
});

describe.concurrent(withPathEntryFirst, () => {
  const shimDir = path.resolve('/shim/bin');
  const usrBin = path.resolve('/usr/bin');

  it('puts the entry ahead of the existing ones', ({ expect }) => {
    const env = withPathEntryFirst({ PATH: usrBin }, shimDir);

    expect(entriesOf(env['PATH'])).toStrictEqual([shimDir, usrBin]);
  });

  it('sets PATH to the entry alone when none is set', ({ expect }) => {
    const env = withPathEntryFirst({ HOME: '/home/user' }, shimDir);

    expect(env).toStrictEqual({ HOME: '/home/user', PATH: shimDir });
  });

  it('keeps the existing key casing', ({ expect }) => {
    const env = withPathEntryFirst({ Path: usrBin }, shimDir);

    expect(env).toStrictEqual({ Path: [shimDir, usrBin].join(path.delimiter) });
  });
});

describe.concurrent(turboEnv, () => {
  const shimRoot = path.resolve('/deps/pnpm-termux-shim');
  const usrBin = path.resolve('/usr/bin');
  const installed = (): string => path.join(shimRoot, 'package.json');

  it('puts the shim first on Android', ({ expect }) => {
    const env = turboEnv({ PATH: usrBin }, cwd, 'android', installed);

    expect(entriesOf(env['PATH'])).toStrictEqual([path.join(shimRoot, 'bin'), usrBin]);
  });

  it('leaves PATH alone on Android when the shim is not installed', ({ expect }) => {
    const env = turboEnv({ PATH: usrBin }, cwd, 'android', missing);

    expect(env).toStrictEqual({ PATH: usrBin });
  });

  it('leaves the shim out on other platforms', ({ expect }) => {
    const env = turboEnv({ PATH: usrBin }, cwd, 'linux', installed);

    expect(env).toStrictEqual({ PATH: usrBin });
  });
});

describe.concurrent(termuxShimDirectory, () => {
  it('returns the bin directory beside the shim manifest', ({ expect }) => {
    const root = path.resolve('/deps/pnpm-termux-shim');

    const dir = termuxShimDirectory(() => path.join(root, 'package.json'));

    expect(dir).toBe(path.join(root, 'bin'));
  });

  it('returns undefined when the shim is not installed', ({ expect }) => {
    const dir = termuxShimDirectory(missing);

    expect(dir).toBeUndefined();
  });

  it('rethrows a resolution failure other than a missing module', ({ expect }) => {
    const error = new Error('Permission denied');

    expect(() => termuxShimDirectory(() => {
      throw error;
    })).toThrow(error);
  });
});
