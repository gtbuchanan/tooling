import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';

const enoent = (): NodeJS.ErrnoException =>
  Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

vi.mock(import('node:fs'), async importOriginal => ({
  ...await importOriginal(),
  statSync: vi.fn<() => never>(() => {
    throw enoent();
  }),
}));

vi.mock(import('#src/lib/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trySpawn: vi.fn<typeof actual.trySpawn>() };
});

const { statSync } = await import('node:fs');
const { trySpawn } = await import('#src/lib/process.js');
const { prepare } = await import('#src/commands/root/prepare.js');

interface Fixture {
  readonly mockStatSync: ReturnType<typeof vi.mocked<typeof statSync>>;
  readonly mockTrySpawn: ReturnType<typeof vi.mocked<typeof trySpawn>>;
}

const createFixture = (): Fixture => {
  const mockStatSync = vi.mocked(statSync);
  const mockTrySpawn = vi.mocked(trySpawn);
  mockStatSync.mockImplementation(() => {
    throw enoent();
  });
  vi.spyOn(console, 'log').mockReturnValue();
  return { mockStatSync, mockTrySpawn };
};

const invoke = async (): Promise<void> => {
  await runCommand(prepare, { rawArgs: [] });
};

const spawnedBins = (fixture: Fixture): readonly string[] =>
  fixture.mockTrySpawn.mock.calls.map(call => call[0]);

const spawnArgsFor = (fixture: Fixture, bin: string): readonly string[] => {
  const call = fixture.mockTrySpawn.mock.calls.find(([name]) => name === bin);
  return call?.[1] ?? [];
};

describe('gtb prepare', () => {
  it('invokes skills-npm with --recursive --yes after hook install', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockTrySpawn.mockResolvedValue(true);

    await invoke();

    expect(spawnedBins(fixture)).toStrictEqual(['prek', 'skills-npm']);
    expect(spawnArgsFor(fixture, 'skills-npm')).toStrictEqual(['--recursive', '--yes']);
  });

  it('logs skills-npm unavailable when trySpawn returns false', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockTrySpawn.mockImplementation(bin => Promise.resolve(bin !== 'skills-npm'));

    await invoke();

    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining('skills-npm unavailable'),
    );
  });

  it('propagates skills-npm failures', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockTrySpawn.mockImplementation((bin) => {
      if (bin === 'skills-npm') {
        return Promise.reject(new Error('skills-npm exited with code 1'));
      }
      return Promise.resolve(true);
    });

    await expect(invoke()).rejects.toThrow(/skills-npm exited with code 1/v);
  });

  it('runs skills-npm in linked worktrees (hook install skipped)', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockStatSync.mockReturnValueOnce({ isFile: () => true } as ReturnType<typeof statSync>);
    fixture.mockTrySpawn.mockResolvedValue(true);

    await invoke();

    expect(spawnedBins(fixture)).toStrictEqual(['skills-npm']);
  });
});
