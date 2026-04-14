import { basename, dirname } from 'node:path';
import { describe, it, vi } from 'vitest';

vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn<typeof actual.existsSync>(() => false),
    readFileSync: vi.fn<typeof actual.readFileSync>(() => 'TN:\nSF:src/index.ts\nend_of_record\n'),
    writeFileSync: vi.fn<typeof actual.writeFileSync>(() => undefined),
  };
});

vi.mock(import('#src/lib/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, run: vi.fn<typeof actual.run>() };
});

vi.mock(import('#src/lib/workspace.js'), () => ({
  resolveWorkspace: vi.fn<() => { packageDirs: readonly string[]; rootDir: string }>(() => ({
    packageDirs: [process.cwd()],
    rootDir: dirname(dirname(process.cwd())),
  })),
}));

const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
const { run } = await import('#src/lib/process.js');
const { def } = await import('#src/commands/leaf/coverage-codecov-upload.js');

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRun = vi.mocked(run);

const getRunArgs = (): readonly string[] => {
  const lastCall = mockRun.mock.calls.at(-1);
  if (lastCall === undefined) {
    return [];
  }
  return lastCall[1]?.args ?? [];
};

describe(def.name, () => {
  it('skips when CI is not set', async ({ expect }) => {
    vi.stubEnv('CI', '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await def.handler([]);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('not in CI'));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('skips when no coverage files exist', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await def.handler([]);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('No coverage'));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('prefers merged lcov over fast', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await def.handler([]);

    expect(getRunArgs()).toContain('dist/coverage/vitest/merged/lcov.codecov.info');
  });

  it('falls back to fast lcov when merged is absent', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockImplementation(
      path => String(path).includes('fast'),
    );

    await def.handler([]);

    expect(getRunArgs()).toContain('dist/coverage/vitest/fast/lcov.codecov.info');
  });

  it('rewrites relative SF paths to repo-relative paths', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await def.handler([]);

    expect(mockReadFileSync).toHaveBeenCalledWith('dist/coverage/vitest/merged/lcov.info', 'utf-8');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'dist/coverage/vitest/merged/lcov.codecov.info',
      expect.stringContaining('SF:packages/cli/src/index.ts'),
    );
  });

  it('keeps lcov file unchanged when SF paths are already repo-relative', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('TN:\nSF:packages/cli/src/index.ts\nend_of_record\n');

    await def.handler([]);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(getRunArgs()).toContain('dist/coverage/vitest/merged/lcov.info');
    expect(getRunArgs()).not.toContain('dist/coverage/vitest/merged/lcov.codecov.info');
  });

  it('passes directory basename as flag', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);
    const expected = basename(process.cwd());

    await def.handler([]);

    expect(getRunArgs()).toContain('-F');
    expect(getRunArgs()).toContain(expected);
  });

  it('forwards extra args', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await def.handler(['--verbose', '--dry-run']);

    expect(getRunArgs()).toContain('--verbose');
    expect(getRunArgs()).toContain('--dry-run');
  });
});
