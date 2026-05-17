import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';
import type { Manifest } from '#src/lib/manifest.js';

vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cpSync: vi.fn<typeof actual.cpSync>(),
    existsSync: vi.fn<typeof actual.existsSync>(() => true),
    rmSync: vi.fn<typeof actual.rmSync>(),
  };
});

vi.mock(import('#src/lib/workspace.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readParsedManifest: vi.fn<typeof actual.readParsedManifest>() };
});

const { cpSync, existsSync, rmSync } = await import('node:fs');
const { readParsedManifest } = await import('#src/lib/workspace.js');
const { compileSkills } = await import('#src/commands/task/compile-skills.js');

interface Fixture {
  readonly mockCpSync: ReturnType<typeof vi.mocked<typeof cpSync>>;
  readonly mockExistsSync: ReturnType<typeof vi.mocked<typeof existsSync>>;
  readonly mockRmSync: ReturnType<typeof vi.mocked<typeof rmSync>>;
  readonly mockManifest: ReturnType<typeof vi.mocked<typeof readParsedManifest>>;
}

const publishDir = build.publishDirectory();

const defaultManifest: Manifest = {
  publishConfig: { directory: publishDir },
};

const createFixture = (manifest: Manifest = defaultManifest): Fixture => {
  const mockCpSync = vi.mocked(cpSync);
  const mockExistsSync = vi.mocked(existsSync);
  const mockRmSync = vi.mocked(rmSync);
  const mockManifest = vi.mocked(readParsedManifest);
  mockManifest.mockReturnValue(manifest);
  return { mockCpSync, mockExistsSync, mockRmSync, mockManifest };
};

const invoke = async (): Promise<void> => {
  await runCommand(compileSkills, { rawArgs: [] });
};

describe('gtb task compile:skills', () => {
  it('copies skills/ into dist/source/skills/ when all preconditions met', async ({ expect }) => {
    const fixture = createFixture();

    await invoke();

    const pkgDir = process.cwd();

    expect(fixture.mockRmSync).toHaveBeenCalledWith(
      path.join(pkgDir, publishDir, 'skills'),
      { force: true, recursive: true },
    );
    expect(fixture.mockCpSync).toHaveBeenCalledWith(
      path.join(pkgDir, 'skills'),
      path.join(pkgDir, publishDir, 'skills'),
      { recursive: true },
    );
  });

  it('skips when package is private', async ({ expect }) => {
    const fixture = createFixture({
      private: true,
      publishConfig: { directory: publishDir },
    });

    await invoke();

    expect(fixture.mockCpSync).not.toHaveBeenCalled();
    expect(fixture.mockRmSync).not.toHaveBeenCalled();
  });

  it('skips when publishConfig.directory is undefined', async ({ expect }) => {
    const fixture = createFixture({});

    await invoke();

    expect(fixture.mockCpSync).not.toHaveBeenCalled();
    expect(fixture.mockRmSync).not.toHaveBeenCalled();
  });

  it('skips when skills/ does not exist', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockExistsSync.mockReturnValue(false);

    await invoke();

    expect(fixture.mockCpSync).not.toHaveBeenCalled();
    expect(fixture.mockRmSync).not.toHaveBeenCalled();
  });
});
