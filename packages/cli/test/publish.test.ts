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
});
