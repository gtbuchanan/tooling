import { describe, it, vi } from 'vitest';
import { createCommands } from '#src/commands/index.js';
import type { run, runParallel } from '#src/lib/process.js';

vi.mock(import('#src/lib/process.js'), () => ({
  run: vi.fn<typeof run>(),
  runParallel: vi.fn<typeof runParallel>(),
}));

vi.mock(import('#src/lib/pack.js'), () => ({
  pack: vi.fn<() => void>(),
  prepack: vi.fn<() => void>(),
}));

describe(createCommands, () => {
  const commands = createCommands({});

  it('registers all expected commands', ({ expect }) => {
    const names = Object.keys(commands).sort();

    expect(names).toEqual([
      'build',
      'build:ci',
      'check',
      'compile',
      'compile:ts',
      'generate',
      'lint',
      'lint:eslint',
      'lint:oxlint',
      'pack',
      'prepare',
      'test',
      'test:e2e',
      'test:fast',
      'test:slow',
      'test:vitest',
      'test:vitest:e2e',
      'test:vitest:fast',
      'test:vitest:slow',
    ]);
  });

  it.for(
    Object.keys(commands),
  )('%s resolves without missing deps', async (name, { expect }) => {
    // Promise.resolve normalizes sync (void) and async (Promise<void>) handlers
    await expect(Promise.resolve(commands[name]!([]))).resolves.toBeUndefined();
  });
});
