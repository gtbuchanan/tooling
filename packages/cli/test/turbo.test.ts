import path from 'node:path';
import { describe, it } from 'vitest';
import { withAbsolutePathEntries } from '#src/commands/root/turbo.js';

const cwd = path.resolve('/repo');
const join = (...segments: readonly string[]): string => path.join(cwd, ...segments);
const entriesOf = (value: string | undefined): readonly string[] =>
  (value ?? '').split(path.delimiter);

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
   * Windows spells the variable `Path`. Writing a second `PATH` key
   * would leave the child with two competing definitions, so the
   * original casing is rewritten in place.
   */
  it('rewrites the existing key casing rather than adding a duplicate', ({ expect }) => {
    const env = withAbsolutePathEntries({ Path: './bin' }, cwd);

    expect(Object.keys(env)).toStrictEqual(['Path']);
    expect(env).toHaveProperty('Path', join('bin'));
  });

  it('does not mutate the source environment', ({ expect }) => {
    const source = { PATH: './bin' };

    withAbsolutePathEntries(source, cwd);

    expect(source).toStrictEqual({ PATH: './bin' });
  });
});
