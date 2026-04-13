import { basename } from 'node:path';
import { afterEach, describe, it, vi } from 'vitest';

vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn<typeof actual.existsSync>(() => false) };
});

vi.mock(import('#src/lib/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, run: vi.fn<typeof actual.run>() };
});

const { existsSync } = await import('node:fs');
const { run } = await import('#src/lib/process.js');
const { def } = await import('#src/commands/leaf/coverage-codecov-upload.js');

const mockExistsSync = vi.mocked(existsSync);
const mockRun = vi.mocked(run);

afterEach(() => {
  vi.restoreAllMocks();
});

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

    expect(mockRun).toHaveBeenCalledWith(
      'codecov',
      expect.objectContaining({
        args: expect.arrayContaining(
          ['-f', 'dist/coverage/vitest/merged/lcov.info'],
        ) as unknown,
      }),
    );
  });

  it('falls back to fast lcov when merged is absent', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockImplementation(
      path => String(path).includes('fast'),
    );

    await def.handler([]);

    expect(mockRun).toHaveBeenCalledWith(
      'codecov',
      expect.objectContaining({
        args: expect.arrayContaining(
          ['-f', 'dist/coverage/vitest/fast/lcov.info'],
        ) as unknown,
      }),
    );
  });

  it('passes directory basename as flag', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);
    const expected = basename(process.cwd());

    await def.handler([]);

    expect(mockRun).toHaveBeenCalledWith(
      'codecov',
      expect.objectContaining({
        args: expect.arrayContaining(['-F', expected]) as unknown,
      }),
    );
  });

  it('forwards extra args', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await def.handler(['--verbose', '--dry-run']);

    expect(mockRun).toHaveBeenCalledWith(
      'codecov',
      expect.objectContaining({
        args: expect.arrayContaining(['--verbose', '--dry-run']) as unknown,
      }),
    );
  });
});
