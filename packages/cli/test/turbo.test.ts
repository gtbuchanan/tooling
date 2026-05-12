import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, vi } from 'vitest';
import { type TurboInvocation, planTurboInvocation } from '#src/commands/root/turbo.js';

interface PrefixFixture {
  readonly prefix: string;
  readonly turboBin: string;
  readonly [Symbol.dispose]: () => void;
}

const createPrefixFixture = (): PrefixFixture => {
  const prefix = mkdtempSync(path.join(tmpdir(), 'gtb-turbo-test-'));
  return {
    prefix,
    turboBin: path.join(prefix, 'bin', 'turbo'),
    [Symbol.dispose]: () => {
      rmSync(prefix, { force: true, recursive: true });
    },
  };
};

const baseOptions = {
  rawArgs: ['run', 'build'] as const,
};

const stubResolver = (resolved?: string) => (): string | undefined => resolved;

/** Narrows a {@link TurboInvocation} to the error variant or throws. */
function assertErrorPlan(
  plan: TurboInvocation,
): asserts plan is Extract<TurboInvocation, { kind: 'error' }> {
  if (plan.kind !== 'error') throw new Error(`expected error plan, got ${plan.kind}`);
}

describe.concurrent(planTurboInvocation, () => {
  it('delegates to turbo on PATH for non-android platforms', ({ expect }) => {
    const plan = planTurboInvocation({ ...baseOptions, platform: 'linux' });

    expect(plan).toStrictEqual({
      args: ['run', 'build'],
      bin: 'turbo',
      kind: 'spawn',
    });
  });

  it('does not invoke the resolver for darwin', ({ expect }) => {
    let called = false;
    const plan = planTurboInvocation({
      ...baseOptions,
      platform: 'darwin',
      resolveAndroidBinary: (): string | undefined => {
        called = true;
        return undefined;
      },
    });

    expect(plan.kind).toBe('spawn');
    expect(called).toBe(false);
  });

  it('does not invoke the resolver for win32', ({ expect }) => {
    let called = false;
    const plan = planTurboInvocation({
      ...baseOptions,
      platform: 'win32',
      resolveAndroidBinary: (): string | undefined => {
        called = true;
        return undefined;
      },
    });

    expect(plan.kind).toBe('spawn');
    expect(called).toBe(false);
  });

  it('uses the resolved global turbo binary on android', ({ expect }) => {
    const plan = planTurboInvocation({
      ...baseOptions,
      platform: 'android',
      resolveAndroidBinary: stubResolver(
        '/data/data/com.termux/files/usr/bin/turbo',
      ),
    });

    expect(plan).toStrictEqual({
      args: ['run', 'build'],
      bin: '/data/data/com.termux/files/usr/bin/turbo',
      kind: 'spawn',
    });
  });

  it('forwards raw args verbatim to the spawn plan', ({ expect }) => {
    const plan = planTurboInvocation({
      ...baseOptions,
      platform: 'android',
      rawArgs: ['run', 'build', '--filter=@scope/pkg', '--concurrency=1'],
      resolveAndroidBinary: stubResolver('/fake/bin/turbo'),
    });

    expect(plan).toMatchObject({
      args: ['run', 'build', '--filter=@scope/pkg', '--concurrency=1'],
      kind: 'spawn',
    });
  });

  it('returns an error plan when the global turbo is missing on android', ({ expect }) => {
    const plan = planTurboInvocation({
      ...baseOptions,
      platform: 'android',
      resolveAndroidBinary: stubResolver(),
    });
    assertErrorPlan(plan);

    expect(plan.message).toContain('pkg install turbo');
    expect(plan.message).toContain('global turbo binary is not installed');
  });
});

/*
 * Default-resolver tests stub $PREFIX, which is global state, so they
 * run serially (no `.concurrent`) and rely on vitest's `unstubEnvs`
 * setting to restore the env between cases.
 */
describe('planTurboInvocation default android resolver', () => {
  it('resolves $PREFIX/bin/turbo when the binary exists', ({ expect }) => {
    using fixture = createPrefixFixture();
    mkdirSync(path.dirname(fixture.turboBin), { recursive: true });
    writeFileSync(fixture.turboBin, '');
    vi.stubEnv('PREFIX', fixture.prefix);

    const plan = planTurboInvocation({ ...baseOptions, platform: 'android' });

    expect(plan).toMatchObject({ bin: fixture.turboBin, kind: 'spawn' });
  });

  it('returns an error plan when $PREFIX/bin/turbo is missing', ({ expect }) => {
    using fixture = createPrefixFixture();
    vi.stubEnv('PREFIX', fixture.prefix);

    const plan = planTurboInvocation({ ...baseOptions, platform: 'android' });

    expect(plan.kind).toBe('error');
  });
});
