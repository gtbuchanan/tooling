import { describe, it } from 'vitest';
import { type TurboInvocation, planTurboInvocation } from '#src/commands/root/turbo.js';

const baseOptions = {
  arch: 'arm64',
  rawArgs: ['run', 'build'] as const,
  rootDir: '/fake/root',
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

  it('resolves the linux-arm64 binary on android arm64', ({ expect }) => {
    const plan = planTurboInvocation({
      ...baseOptions,
      arch: 'arm64',
      platform: 'android',
      resolveAndroidBinary: stubResolver(
        '/fake/root/node_modules/@turbo/linux-arm64/bin/turbo',
      ),
    });

    expect(plan).toStrictEqual({
      args: ['run', 'build'],
      bin: '/fake/root/node_modules/@turbo/linux-arm64/bin/turbo',
      kind: 'spawn',
    });
  });

  it('resolves the linux-64 binary on android x64', ({ expect }) => {
    const calls: string[] = [];
    const plan = planTurboInvocation({
      ...baseOptions,
      arch: 'x64',
      platform: 'android',
      resolveAndroidBinary: (rootDir) => {
        calls.push(rootDir);
        return '/fake/root/node_modules/@turbo/linux-64/bin/turbo';
      },
    });

    expect(plan).toMatchObject({
      bin: '/fake/root/node_modules/@turbo/linux-64/bin/turbo',
      kind: 'spawn',
    });
    expect(calls).toStrictEqual(['/fake/root']);
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

  it('returns an error plan when the linux binary is missing on android', ({ expect }) => {
    const plan = planTurboInvocation({
      ...baseOptions,
      platform: 'android',
      resolveAndroidBinary: stubResolver(),
    });
    assertErrorPlan(plan);

    expect(plan.message).toContain('supported-architectures');
    expect(plan.message).toContain('pnpm install --force');
  });
});
