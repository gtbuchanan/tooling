import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { runCommand } from 'citty';
import { describe, it, vi } from 'vitest';
import type { WorkspacePackage } from '#src/core/discovery.js';

vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn<typeof actual.existsSync>(() => false),
    mkdirSync: vi.fn<typeof actual.mkdirSync>(),
    /*
     * `typeof readFileSync` is too wide for one of its overloads under
     * the strict typed factory; `() => never` is assignable to every
     * overload. The real return is supplied per-test via mockReturnValue.
     */
    readFileSync: vi.fn<() => never>(),
    writeFileSync: vi.fn<typeof actual.writeFileSync>(),
  };
});

vi.mock(import('find-up-simple'), () => ({
  findUpSync: vi.fn<() => string | undefined>(() => '/repo/.git'),
}));

vi.mock(import('#src/core/process.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, run: vi.fn<typeof actual.run>() };
});

/**
 * A discovered package with no capabilities beyond the given manifest name.
 */
const capabilities = (name: string): WorkspacePackage => ({
  capabilities: new Set(),
  dir: faker.system.directoryPath(),
  generateScripts: [],
  manifest: {},
  name,
});

/*
 * The default implementation lives in the factory (not a lifecycle hook) so
 * it survives `mockReset` — tests that don't care about the flag still get a
 * discoverable package.
 */
vi.mock(import('#src/core/discovery.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    discoverPackage: vi.fn<typeof actual.discoverPackage>(
      () => capabilities(build.packageName()),
    ),
  };
});

const { existsSync, readFileSync } = await import('node:fs');
const { discoverPackage } = await import('#src/core/discovery.js');
const { run } = await import('#src/core/process.js');
const { toolchainReports } = await import('#src/tasks/toolchain.js');
const { toolchains } = await import('#src/toolchains/index.js');
const { coverageCodecovUpload } = await import(
  '#src/toolchains/codecov/commands/coverage-codecov-upload.js',
);

// Built from what the registered toolchains declare, as `gtb task` builds it.
const command = coverageCodecovUpload(toolchainReports(toolchains, 'coverage'));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockRun = vi.mocked(run);
const mockDiscoverPackage = vi.mocked(discoverPackage);

const getRunArgs = (): readonly string[] => {
  const lastCall = mockRun.mock.calls.at(-1);
  return lastCall === undefined ? [] : lastCall[1]?.args ?? [];
};

const invoke = async (rawArgs: readonly string[]): Promise<void> => {
  await runCommand(command, { rawArgs: [...rawArgs] });
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

  /*
   * CI restores either the merged report or the fast one. Where both exist,
   * Codecov combines the uploads, and merged already covers what fast does.
   */
  it('uploads each declared report that exists', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await invoke([]);

    // The CLI takes one file per `-f`, so each must follow its own flag.
    const args = getRunArgs();
    const uploaded = args.filter((_arg, index) => args[index - 1] === '-f');

    expect(uploaded).toStrictEqual([
      'dist/coverage/vitest/merged/lcov.info',
      'dist/coverage/vitest/fast/lcov.info',
      'dist/coverage/vitest/slow/lcov.info',
    ]);
  });

  it('uploads only the reports on disk', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockImplementation(
      path => String(path).includes('fast'),
    );

    await invoke([]);

    expect(getRunArgs()).toContain('dist/coverage/vitest/fast/lcov.info');
    expect(getRunArgs()).not.toContain('dist/coverage/vitest/merged/lcov.info');
  });

  it('disables telemetry ahead of the subcommand', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);

    await invoke([]);

    const args = getRunArgs();

    /* `--disable-telem` is an option of `codecov`, not of `upload-process`;
       the CLI rejects it after the subcommand with `No such option`. Assert
       presence separately — a bare index comparison passes vacuously when the
       flag is absent, since indexOf returns -1. */
    expect(args).toContain('--disable-telem');
    expect(args.indexOf('--disable-telem')).toBeLessThan(args.indexOf('upload-process'));
  });

  it('passes the unscoped package name as flag', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);
    const name = build.packageName();
    mockDiscoverPackage.mockReturnValue(capabilities(`@${build.packageName()}/${name}`));

    await invoke([]);

    expect(getRunArgs()).toContain('-F');
    expect(getRunArgs()).toContain(name);
  });

  it('discovers the package from the working directory', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    mockExistsSync.mockReturnValue(true);
    mockDiscoverPackage.mockReturnValue(capabilities(build.packageName()));

    await invoke([]);

    expect(mockDiscoverPackage).toHaveBeenCalledWith(process.cwd(), []);
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

  it('passes the PR head sha from the event payload', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_EVENT_PATH', '/ci/event.json');
    const headSha = faker.git.commitSha();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ pull_request: { head: { sha: headSha } } }),
    );

    await invoke([]);

    expect(getRunArgs()).toContain('-C');
    expect(getRunArgs()).toContain(headSha);
  });

  /*
   * Codecov accepts a tokenless upload only for an unprotected branch, which
   * it recognizes by an `owner:branch` name. The CLI sends the bare head ref,
   * so a fork's upload is refused unless the head label is passed instead.
   */
  it('passes the head label as branch for a fork pull request', async ({
    expect,
  }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_EVENT_PATH', '/ci/event.json');
    const label = `${build.packageName()}:${build.packageName()}`;
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      pull_request: {
        base: { repo: { full_name: `${build.packageName()}/repo` } },
        head: {
          label,
          repo: { full_name: `${build.packageName()}/fork` },
          sha: faker.git.commitSha(),
        },
      },
    }));

    await invoke([]);

    const args = getRunArgs();

    expect(args[args.indexOf('-B') + 1]).toBe(label);
  });

  it('leaves the branch to the CLI for a same-repository pull request', async ({
    expect,
  }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_EVENT_PATH', '/ci/event.json');
    const repo = { full_name: `${build.packageName()}/repo` };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      pull_request: {
        base: { repo },
        head: { label: build.packageName(), repo, sha: faker.git.commitSha() },
      },
    }));

    await invoke([]);

    expect(getRunArgs()).not.toContain('-B');
  });

  /*
   * A deleted fork leaves `head.repo` null, and a forge's payload may omit
   * the fields entirely. Neither may cost the upload its head sha.
   */
  it('passes the head sha without a branch when head.repo is null', async ({
    expect,
  }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_EVENT_PATH', '/ci/event.json');
    const headSha = faker.git.commitSha();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      pull_request: {
        base: { repo: { full_name: `${build.packageName()}/repo` } },
        head: {
          label: build.packageName(),
          /* eslint-disable-next-line unicorn/no-null --
             GitHub's payload carries null here, which JSON can't spell as undefined */
          repo: null,
          sha: headSha,
        },
      },
    }));

    await invoke([]);

    const args = getRunArgs();

    expect(args).not.toContain('-B');
    expect(args[args.indexOf('-C') + 1]).toBe(headSha);
  });

  it('falls back to GITHUB_SHA when not a pull request', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_EVENT_PATH', '/ci/event.json');
    const sha = faker.git.commitSha();
    vi.stubEnv('GITHUB_SHA', sha);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ ref: 'refs/heads/main' }));

    await invoke([]);

    expect(getRunArgs()).toContain('-C');
    expect(getRunArgs()).toContain(sha);
  });

  it('falls back to GITHUB_SHA when the event payload is unreadable', async ({
    expect,
  }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_EVENT_PATH', '/ci/event.json');
    const sha = faker.git.commitSha();
    vi.stubEnv('GITHUB_SHA', sha);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('boom');
    });

    await invoke([]);

    expect(getRunArgs()).toContain('-C');
    expect(getRunArgs()).toContain(sha);
  });

  it('omits -C when no commit sha is resolvable', async ({ expect }) => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_EVENT_PATH', '');
    vi.stubEnv('GITHUB_SHA', '');
    mockExistsSync.mockReturnValue(true);

    await invoke([]);

    expect(getRunArgs()).not.toContain('-C');
  });
});
