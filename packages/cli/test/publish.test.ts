import { describe, it } from 'vitest';
import { executePublish } from '#src/commands/root/publish.js';

interface RunCall {
  readonly args: readonly string[];
  readonly command: string;
}

describe.concurrent(executePublish, () => {
  it('awaits npm publish before starting the non-npm channels', async ({ expect }) => {
    const order: string[] = [];
    const runCalls: RunCall[] = [];
    let hasNpmFinished = false;

    await executePublish({
      publishNonNpm: async () => {
        // npm publish must have fully settled before this starts.
        expect(hasNpmFinished).toBe(true);

        order.push('non-npm:start');
        await Promise.resolve();
        order.push('non-npm:end');
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
      'npm:start', 'npm:end', 'non-npm:start', 'non-npm:end',
    ]);
  });
});
