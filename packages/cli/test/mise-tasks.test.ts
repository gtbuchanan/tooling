import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { describe, it } from 'vitest';
import {
  checkMiseTasksInclude, generateMiseTasks, miseTasksFileName,
} from '#src/lib/mise-tasks.js';
import { createTempDir } from './helpers.ts';

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

describe.concurrent(checkMiseTasksInclude, () => {
  it('passes when the include is present', ({ expect }) => {
    const dir = createTempDir();
    writeFileSync(
      path.join(dir, 'mise.toml'),
      '[task_config]\nincludes = ["mise-tasks", "mise.tasks.toml"]\n',
    );

    expect(checkMiseTasksInclude(dir)).toStrictEqual([]);
  });

  it('reports drift when the include is missing', ({ expect }) => {
    const dir = createTempDir();
    writeFileSync(path.join(dir, 'mise.toml'), '[tools]\nnode = "24"\n');

    expect(checkMiseTasksInclude(dir)).toStrictEqual([
      expect.stringContaining('[task_config] includes must contain'),
    ]);
  });

  it('reports invalid TOML', ({ expect }) => {
    const dir = createTempDir();
    writeFileSync(path.join(dir, 'mise.toml'), 'includes = [');

    expect(checkMiseTasksInclude(dir)).toStrictEqual(['mise.toml: invalid TOML']);
  });
});
