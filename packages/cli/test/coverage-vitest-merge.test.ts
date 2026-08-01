import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';

vi.mock(import('#src/lib/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, run: vi.fn<typeof actual.run>() };
});

const { run } = await import('#src/lib/process.js');
const { coverageVitestMerge } = await import(
  '#src/commands/task/coverage-vitest-merge.js',
);

const mockRun = vi.mocked(run);

const getRunArgs = (): readonly string[] => {
  const lastCall = mockRun.mock.calls.at(-1);
  if (lastCall === undefined) {
    return [];
  }
  return lastCall[1]?.args ?? [];
};

const invoke = async (rawArgs: readonly string[]): Promise<void> => {
  await runCommand(coverageVitestMerge, { rawArgs: [...rawArgs] });
};

describe('coverage:vitest:merge', () => {
  it('merges the blob reports directory', async ({ expect }) => {
    await invoke([]);

    expect(getRunArgs()).toContain('--merge-reports');
    expect(getRunArgs()).toContain('dist/test-results/vitest/merge');
  });

  it('writes the merged coverage report directory', async ({ expect }) => {
    await invoke([]);

    expect(getRunArgs()).toContain(
      '--coverage.reportsDirectory=dist/coverage/vitest/merged',
    );
  });

  it('replaces config reporters so blob is inactive during merge', async ({
    expect,
  }) => {
    await invoke([]);

    expect(getRunArgs()).toContain('--reporter=default');
  });

  it('forwards extra args', async ({ expect }) => {
    await invoke(['--silent']);

    expect(getRunArgs()).toContain('--silent');
  });
});
