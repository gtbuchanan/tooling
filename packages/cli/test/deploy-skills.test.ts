import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';

vi.mock(import('#src/lib/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, run: vi.fn<typeof actual.run>() };
});

vi.mock(import('#src/lib/skills-config.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadConfiguredAgents: vi.fn<typeof actual.loadConfiguredAgents>(),
  };
});

vi.mock(import('#src/lib/workspace.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveWorkspace: vi.fn<typeof actual.resolveWorkspace>(() => ({
      packageDirs: [process.cwd()],
      packageGlobs: [],
      rootDir: process.cwd(),
    })),
  };
});

vi.mock(import('skills-npm'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDetectedAgents: vi.fn<typeof actual.getDetectedAgents>(),
  };
});

const { run } = await import('#src/lib/process.js');
const { loadConfiguredAgents } = await import('#src/lib/skills-config.js');
const { resolveWorkspace } = await import('#src/lib/workspace.js');
const { getDetectedAgents } = await import('skills-npm');
const { deploySkills } = await import('#src/commands/task/deploy-skills.js');

interface Fixture {
  readonly mockRun: ReturnType<typeof vi.mocked<typeof run>>;
  readonly mockLoadConfigured: ReturnType<typeof vi.mocked<typeof loadConfiguredAgents>>;
  readonly mockResolveWorkspace: ReturnType<typeof vi.mocked<typeof resolveWorkspace>>;
  readonly mockDetected: ReturnType<typeof vi.mocked<typeof getDetectedAgents>>;
}

const createFixture = (): Fixture => {
  const mockRun = vi.mocked(run);
  const mockLoadConfigured = vi.mocked(loadConfiguredAgents);
  const mockResolveWorkspace = vi.mocked(resolveWorkspace);
  const mockDetected = vi.mocked(getDetectedAgents);
  mockResolveWorkspace.mockReturnValue({
    packageDirs: [process.cwd()],
    packageGlobs: [],
    rootDir: process.cwd(),
  });
  return { mockRun, mockLoadConfigured, mockResolveWorkspace, mockDetected };
};

const invoke = async (): Promise<void> => {
  await runCommand(deploySkills, { rawArgs: [] });
};

const runArgs = (fixture: Fixture): readonly string[] => {
  const call = fixture.mockRun.mock.calls.at(-1);
  return call?.[1]?.args ?? [];
};

describe('gtb task deploy:skills', () => {
  it('uses configured agents when skills-npm.config.ts declares them', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockLoadConfigured.mockResolvedValue(['claude-code', 'codex']);

    await invoke();

    expect(runArgs(fixture)).toStrictEqual([
      'add', '.', '--skill', '*', '--yes',
      '--agent', 'claude-code',
      '--agent', 'codex',
    ]);
    expect(fixture.mockDetected).not.toHaveBeenCalled();
  });

  it('falls back to getDetectedAgents when no config is present', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockLoadConfigured.mockResolvedValue([]);
    fixture.mockDetected.mockResolvedValue(['claude-code']);

    await invoke();

    expect(runArgs(fixture)).toStrictEqual([
      'add', '.', '--skill', '*', '--yes', '--agent', 'claude-code',
    ]);
  });

  it('no-ops when neither config nor detection yields agents', async ({ expect }) => {
    const fixture = createFixture();
    const log = vi.spyOn(console, 'log').mockReturnValue();
    fixture.mockLoadConfigured.mockResolvedValue([]);
    fixture.mockDetected.mockResolvedValue([]);

    await invoke();

    expect(fixture.mockRun).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No agents detected'));
  });

  it('passes ./<rel-path> when cwd is inside a subdirectory of rootDir', async ({ expect }) => {
    const fixture = createFixture();
    fixture.mockResolveWorkspace.mockReturnValue({
      packageDirs: [process.cwd()],
      packageGlobs: [],
      rootDir: `${process.cwd()}/..`,
    });
    fixture.mockLoadConfigured.mockResolvedValue(['claude-code']);

    await invoke();

    expect(runArgs(fixture)[1]).toMatch(/^\.\/.+/v);
  });
});
