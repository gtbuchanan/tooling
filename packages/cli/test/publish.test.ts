import { describe, it } from 'vitest';
import { executePublish } from '#src/commands/root/publish.js';

interface RunCall {
  readonly args: readonly string[];
  readonly command: string;
}

describe.concurrent(executePublish, () => {
  it('runs npm publish, then the npm releases, then the non-npm channels', async ({ expect }) => {
    const order: string[] = [];
    const runCalls: RunCall[] = [];
    let hasNpmFinished = false;

    await executePublish({
      publishNonNpm: async () => {
        // The npm channel (publish + releases) must have settled before this.
        expect(order).toContain('releases:end');

        order.push('non-npm:start');
        await Promise.resolve();
        order.push('non-npm:end');
      },
      releaseNpm: async () => {
        // npm publish must have fully settled before its releases are cut.
        expect(hasNpmFinished).toBe(true);

        order.push('releases:start');
        await Promise.resolve();
        order.push('releases:end');
      },
      run: async (command, options) => {
        order.push('npm:start');
        runCalls.push({ args: options?.args ?? [], command });
        await Promise.resolve();
        hasNpmFinished = true;
        order.push('npm:end');
      },
    });

    expect(runCalls).toStrictEqual([
      { args: ['exec', 'changeset', 'publish'], command: 'pnpm' },
    ]);
    expect(order).toStrictEqual([
      'npm:start', 'npm:end', 'releases:start', 'releases:end', 'non-npm:start', 'non-npm:end',
    ]);
  });

  it('runs the non-npm channels even when the npm releases fail', async ({ expect }) => {
    const order: string[] = [];

    await expect(executePublish({
      publishNonNpm: () => {
        order.push('non-npm');

        return Promise.resolve();
      },
      releaseNpm: () => Promise.reject(new Error('npm releases exploded')),
      run: () => Promise.resolve(),
    })).rejects.toThrow(AggregateError);

    // The channels are independent: one failing must not strand the others.
    expect(order).toStrictEqual(['non-npm']);
  });

  it('skips every channel when the registry publish fails', async ({ expect }) => {
    const order: string[] = [];
    const channel = (name: string) => () => {
      order.push(name);

      return Promise.resolve();
    };

    await expect(executePublish({
      publishNonNpm: channel('non-npm'),
      releaseNpm: channel('releases'),
      run: () => Promise.reject(new Error('changeset publish exploded')),
    })).rejects.toThrow('changeset publish exploded');

    expect(order).toStrictEqual([]);
  });
});
