import { describe, it } from 'vitest';
import { hkMiseTasks } from '#src/toolchains/hk/mise-tasks.js';

describe.concurrent(hkMiseTasks, () => {
  it('runs gtb through pnpm exec in a repo depending on the CLI', ({ expect }) => {
    const tasks = hkMiseTasks({ dependsOnCli: true, isSelfHosted: false });

    expect(tasks).toMatchObject({
      'hk:all': { run: 'pnpm exec gtb hk all' },
      'hk:base': { run: 'pnpm exec gtb hk base' },
    });
  });

  it('uses the gtb script shim when self-hosted', ({ expect }) => {
    const tasks = hkMiseTasks({ dependsOnCli: true, isSelfHosted: true });

    expect(tasks).toMatchObject({
      'hk:all': { run: 'pnpm run gtb hk all' },
      'hk:base': { run: 'pnpm run gtb hk base' },
    });
  });

  it('uses bare gtb (mise npm: backend) for an hk-only adopter', ({ expect }) => {
    const tasks = hkMiseTasks({ dependsOnCli: false, isSelfHosted: false });

    expect(tasks).toMatchObject({
      'hk:all': { run: 'gtb hk all' },
      'hk:base': { run: 'gtb hk base' },
    });
  });
});
