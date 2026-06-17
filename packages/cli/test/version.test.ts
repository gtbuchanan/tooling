import { describe, it } from 'vitest';
import { executeVersion } from '#src/commands/root/version.js';

interface RunCall {
  readonly args: readonly string[];
  readonly command: string;
}

describe.concurrent(executeVersion, () => {
  it('awaits changeset version before the manifest-scoped sync', async ({ expect }) => {
    const order: string[] = [];
    const runCalls: RunCall[] = [];
    let syncScopes: readonly string[] = [];
    let runFinished = false;

    await executeVersion({
      run: async (command, options) => {
        order.push('run:start');
        runCalls.push({ args: options?.args ?? [], command });
        await Promise.resolve();
        runFinished = true;
        order.push('run:end');
      },
      // `sync` is synchronous (`=> void`); it must not run until `run` settled.
      sync: (options) => {
        expect(runFinished).toBe(true);

        order.push('sync');
        syncScopes = [...(options.scopes ?? [])];
      },
    });

    expect(runCalls).toStrictEqual([
      { args: ['exec', 'changeset', 'version'], command: 'pnpm' },
    ]);
    expect(syncScopes).toStrictEqual(['manifest']);
    expect(order).toStrictEqual(['run:start', 'run:end', 'sync']);
  });
});
