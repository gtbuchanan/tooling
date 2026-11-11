import { describe, it } from 'vitest';
import { executeVersion } from '#src/release/commands/version.js';

interface RunCall {
  readonly args: readonly string[];
  readonly command: string;
}

describe.concurrent(executeVersion, () => {
  it('awaits changeset version before the sync', async ({ expect }) => {
    const order: string[] = [];
    let hasRunFinished = false;

    await executeVersion({
      run: async () => {
        order.push('run:start');
        await Promise.resolve();
        hasRunFinished = true;
        order.push('run:end');
      },
      // `sync` is synchronous (`=> void`); it must not run until `run` settled.
      sync: () => {
        expect(hasRunFinished).toBe(true);

        order.push('sync');
      },
    });

    expect(order.slice(0, 3)).toStrictEqual(['run:start', 'run:end', 'sync']);
  });

  it('fixes the unstaged files with hk after the sync', async ({ expect }) => {
    const calls: (RunCall | 'sync')[] = [];

    await executeVersion({
      run: async (command, options) => {
        await Promise.resolve();
        calls.push({ args: options?.args ?? [], command });
      },
      sync: () => {
        calls.push('sync');
      },
    });

    expect(calls).toStrictEqual([
      { args: ['exec', 'changeset', 'version'], command: 'pnpm' },
      'sync',
      { args: ['fix', '--unstaged'], command: 'hk' },
    ]);
  });
});
