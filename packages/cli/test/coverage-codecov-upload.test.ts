import path from 'node:path';
import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';

vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn<typeof actual.existsSync>(() => false) };
});

vi.mock(import('find-up-simple'), () => ({
  findUpSync: vi.fn<() => string | undefined>(() => '/repo/.git'),
}));

vi.mock(import('#src/lib/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, run: vi.fn<typeof actual.run>() };
});

const { existsSync } = await import('node:fs');
const { run } = await import('#src/lib/process.js');
const { coverageCodecovUpload } = await import(
  '#src/commands/task/coverage-codecov-upload.js',
);

const mockExistsSync = vi.mocked(existsSync);
const mockRun = vi.mocked(run);

const getRunArgs = (): readonly string[] => {
  const lastCall = mockRun.mock.calls.at(-1);
  if (lastCall === undefined) {
    return [];
  }
  return lastCall[1]?.args ?? [];
};

const invoke = async (rawArgs: readonly string[]): Promise<void> => {
  await runCommand(coverageCodecovUpload, { rawArgs: [...rawArgs] });
};

describe('coverage:codecov:upload', () => {
  it('skips when CI is not set', async ({ expect }) => {
    vi.stubEnv('CI', '');
    const log = vi.spyOn(console, 'log').mockReturnValue();

    await invoke([]);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('not in CI'));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('skips when no coverage files exist', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    const log = vi.spyOn(console, 'log').mockReturnValue();

    await invoke([]);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('No coverage'));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('prefers merged lcov over fast', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await invoke([]);

    expect(getRunArgs()).toContain('dist/coverage/vitest/merged/lcov.info');
  });

  it('falls back to fast lcov when merged is absent', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockImplementation(
      path => String(path).includes('fast'),
    );

    await invoke([]);

    expect(getRunArgs()).toContain('dist/coverage/vitest/fast/lcov.info');
  });

  it('passes directory basename as flag', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);
    const expected = path.basename(process.cwd());

    await invoke([]);

    expect(getRunArgs()).toContain('-F');
    expect(getRunArgs()).toContain(expected);
  });

  it('passes network root from GITHUB_WORKSPACE', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_WORKSPACE', '/ci/workspace');
    mockExistsSync.mockReturnValue(true);

    await invoke([]);

    expect(getRunArgs()).toContain('--network-root-folder');
    expect(getRunArgs()).toContain('/ci/workspace');
  });

  it('falls back to git root for network root', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    delete process.env['GITHUB_WORKSPACE'];
    mockExistsSync.mockReturnValue(true);

    await invoke([]);

    expect(getRunArgs()).toContain('--network-root-folder');
    expect(getRunArgs()).toContain('/repo');
  });

  it('forwards extra args', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await invoke(['--verbose', '--dry-run']);

    expect(getRunArgs()).toContain('--verbose');
    expect(getRunArgs()).toContain('--dry-run');
  });
});
