import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';

vi.mock(import('#src/lib/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trySpawn: vi.fn<typeof actual.trySpawn>() };
});

const { trySpawn } = await import('#src/lib/process.js');
const { prepare } = await import('#src/commands/root/prepare.js');

interface Fixture {
  readonly mockTrySpawn: ReturnType<typeof vi.mocked<typeof trySpawn>>;
}

const createFixture = (): Fixture => {
  const mockTrySpawn = vi.mocked(trySpawn);
  vi.spyOn(console, 'log').mockReturnValue();
  return { mockTrySpawn };
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
  it('invokes skills-npm with --recursive --yes', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockTrySpawn.mockResolvedValue(true);

    await invoke();

    expect(spawnedBins(fixture)).toStrictEqual(['skills-npm']);
    expect(spawnArgsFor(fixture, 'skills-npm')).toStrictEqual(['--recursive', '--yes']);
  });

  it('logs skills-npm unavailable when trySpawn returns false', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockTrySpawn.mockResolvedValue(false);

    await invoke();

    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining('skills-npm unavailable'),
    );
  });

  it('propagates skills-npm failures', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockTrySpawn.mockRejectedValue(new Error('skills-npm exited with code 1'));

    await expect(invoke()).rejects.toThrow(/skills-npm exited with code 1/v);
  });
});
