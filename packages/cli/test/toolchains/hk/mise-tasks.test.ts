import { parse as parseToml } from 'smol-toml';
import { describe, it } from 'vitest';
import {
  generateMiseTasks, miseTasksFileName,
} from '#src/toolchains/hk/mise-tasks.js';

describe.concurrent(generateMiseTasks, () => {
  it('emits hk:all and hk:base as loadable include-format tasks', ({ expect }) => {
    const parsed = parseToml(generateMiseTasks({ dependsOnCli: true, isSelfHosted: false }));

    expect(parsed).toMatchObject({
      'hk:all': { run: 'pnpm exec gtb hk all' },
      'hk:base': { run: 'pnpm exec gtb hk base' },
    });
  });

  it('uses the gtb script shim when self-hosted', ({ expect }) => {
    const parsed = parseToml(generateMiseTasks({ dependsOnCli: true, isSelfHosted: true }));

    expect(parsed).toMatchObject({
      'hk:all': { run: 'pnpm run gtb hk all' },
      'hk:base': { run: 'pnpm run gtb hk base' },
    });
  });

  it('uses pnpm exec when the repo depends on @gtbuchanan/cli', ({ expect }) => {
    const parsed = parseToml(generateMiseTasks({ dependsOnCli: true, isSelfHosted: false }));

    expect(parsed).toHaveProperty(['hk:base', 'run'], 'pnpm exec gtb hk base');
  });

  it('uses bare gtb (mise npm: backend) for an hk-only adopter', ({ expect }) => {
    const parsed = parseToml(generateMiseTasks({ dependsOnCli: false, isSelfHosted: false }));

    expect(parsed).toMatchObject({
      'hk:all': { run: 'gtb hk all' },
      'hk:base': { run: 'gtb hk base' },
    });
  });

  it('documents the include line referencing its own filename', ({ expect }) => {
    expect(generateMiseTasks({ dependsOnCli: false, isSelfHosted: false })).toContain(
      `includes = ["${miseTasksFileName}"]`,
    );
  });
});
