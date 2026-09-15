import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import * as build from '#src/builders.js';
import {
  createGitEnv, matchTarball, npmInstallArgs, pinned, runCommand,
} from '#src/fixture.js';
import {
  type ExecRunner,
  exec, formatExecError, isStaleMetadataFailure, npmInstall,
} from '#src/lib/command.js';

describe.concurrent(npmInstallArgs, () => {
  it('installs the given specs', ({ expect }) => {
    const tarball = faker.system.commonFileName('tgz');
    const spec = `${faker.word.noun()}@1.2.3`;

    const result = npmInstallArgs([tarball, spec]);

    expect(result.slice(0, 3)).toStrictEqual(['install', tarball, spec]);
  });

  /*
   * Each fixture runs its own `npm install`, so anything the registry is
   * asked for is paid per fixture. The audit request alone posts the whole
   * dependency tree. Specs are already exact versions (see `pinned`), so
   * revalidating cached metadata buys nothing a fixture can observe — and
   * when the registry is slow, these round-trips are what pushes an e2e
   * test past its timeout.
   */
  it('asks the registry for nothing it can take from cache', ({ expect }) => {
    const spec = faker.word.noun();

    const result = npmInstallArgs([spec]);

    expect(result).toStrictEqual(
      expect.arrayContaining([spec, '--prefer-offline', '--no-audit', '--no-fund']),
    );
  });

  it('reaches the registry when asked to revalidate', ({ expect }) => {
    const spec = faker.word.noun();

    const result = npmInstallArgs([spec], { revalidate: true });

    expect(result).toContain('--prefer-online');
    expect(result).not.toContain('--prefer-offline');
  });
});

/*
 * Verbatim npm output, so the predicate is pinned to what npm actually prints
 * rather than to a paraphrase that drifts from it.
 */
const staleMetadataOutput = [
  'npm error code ETARGET',
  'npm error notarget No matching version found for eslint-plugin-unicorn@^74.0.0.',
].join('\n');

describe.concurrent(isStaleMetadataFailure, () => {
  it('recognizes npm resolving against a stale packument', ({ expect }) => {
    expect(isStaleMetadataFailure(staleMetadataOutput)).toBe(true);
  });

  it('does not claim an unrelated install failure', ({ expect }) => {
    const linkBinsFailure = [
      '[ENOENT] ENOENT: no such file or directory, mkdir',
      "  '/home/runner/work/tooling/node_modules/.pnpm/pkg/node_modules/.bin'",
    ].join('\n');

    expect(isStaleMetadataFailure(linkBinsFailure)).toBe(false);
  });

  /*
   * The message carries the whole command line ahead of the child's output,
   * so a spec that merely spells the code would otherwise buy a retry that
   * every genuine failure then pays for.
   */
  it('does not claim a failure whose spec merely spells the code', ({ expect }) => {
    const message = formatExecError({
      args: ['install', 'notarget-utils@1.0.0'],
      command: 'npm',
      status: 1,
      stderr: 'npm error code ENOENT',
      stdout: '',
    });

    expect(isStaleMetadataFailure(message)).toBe(false);
  });
});

interface RecordedCall {
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

/**
 * An {@link npmInstall} runner that records each attempt's argv and working
 * directory, and fails the nth attempt with `failures[n]`, so the retry policy
 * can be exercised without reaching a registry.
 */
const recordingRunner = (failures: readonly string[]) => {
  const calls: RecordedCall[] = [];
  const run: ExecRunner = (_command, args, options) => {
    const failure = failures[calls.length];
    calls.push({
      args,
      cwd: typeof options.cwd === 'string' ? options.cwd : undefined,
    });
    if (failure !== undefined) {
      throw new Error(failure);
    }
  };
  return { calls, run };
};

describe.concurrent(npmInstall, () => {
  it('installs the given specs into the given directory', ({ expect }) => {
    const cwd = faker.system.directoryPath();
    const spec = build.scopedPackageName();
    const { calls, run } = recordingRunner([]);

    npmInstall(cwd, [spec], run);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ cwd });
    expect(calls[0]?.args).toContain(spec);
    expect(calls[0]?.args).toContain('--prefer-offline');
  });

  /*
   * `--prefer-offline` bypasses staleness checks, so a packument cached before
   * a version was published yields ETARGET for a version that exists. That is
   * the state a dependency bump leaves the cache in, so the retry has to reach
   * the registry rather than report the version missing.
   */
  it('retries against the registry after a stale-metadata failure', ({ expect }) => {
    const cwd = faker.system.directoryPath();
    const spec = build.scopedPackageName();
    const { calls, run } = recordingRunner([staleMetadataOutput]);

    npmInstall(cwd, [spec], run);

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ cwd });
    expect(calls[1]?.args).toContain(spec);
    expect(calls[1]?.args).toContain('--prefer-online');
    expect(calls[1]?.args).not.toContain('--prefer-offline');
  });

  it('rethrows an unrelated failure without retrying', ({ expect }) => {
    const marker = faker.string.alphanumeric(12);
    const { calls, run } = recordingRunner([marker]);

    expect(() => {
      npmInstall(faker.system.directoryPath(), [build.scopedPackageName()], run);
    }).toThrow(new RegExp(marker, 'v'));
    expect(calls).toHaveLength(1);
  });

  it('surfaces the retry failure when revalidating does not help', ({ expect }) => {
    const { calls, run } = recordingRunner([staleMetadataOutput, staleMetadataOutput]);

    expect(() => {
      npmInstall(faker.system.directoryPath(), [build.scopedPackageName()], run);
    }).toThrow(/ETARGET/v);
    expect(calls).toHaveLength(2);
  });
});

describe.concurrent(matchTarball, () => {
  it('matches a scoped package tarball', ({ expect }) => {
    const files = ['gtbuchanan-eslint-config-0.0.0.tgz'];

    expect(matchTarball(files, '@gtbuchanan/eslint-config')).toBe(
      'gtbuchanan-eslint-config-0.0.0.tgz',
    );
  });

  it('does not match a similarly-named package', ({ expect }) => {
    const files = [
      'gtbuchanan-eslint-config-0.0.0.tgz',
      'gtbuchanan-eslint-config-extra-0.0.0.tgz',
    ];

    expect(() => matchTarball(files, '@gtbuchanan/eslint-config-extra')).not.toThrow();
    expect(matchTarball(files, '@gtbuchanan/eslint-config-extra')).toBe(
      'gtbuchanan-eslint-config-extra-0.0.0.tgz',
    );
  });

  it('throws when no tarball matches', ({ expect }) => {
    const files = ['unrelated-0.0.0.tgz'];

    expect(() => matchTarball(files, '@gtbuchanan/eslint-config')).toThrow(
      /found 0/iv,
    );
  });

  it('throws when multiple tarballs match', ({ expect }) => {
    const files = [
      'gtbuchanan-eslint-config-0.0.0.tgz',
      'gtbuchanan-eslint-config-1.0.0.tgz',
    ];

    expect(() => matchTarball(files, '@gtbuchanan/eslint-config')).toThrow(
      /found 2/iv,
    );
  });

  it('ignores non-tgz files', ({ expect }) => {
    const files = [
      'gtbuchanan-eslint-config-0.0.0.tgz',
      'gtbuchanan-eslint-config-0.0.0.tar.gz',
    ];

    expect(matchTarball(files, '@gtbuchanan/eslint-config')).toBe(
      'gtbuchanan-eslint-config-0.0.0.tgz',
    );
  });
});

describe.concurrent(createGitEnv, () => {
  it('isolates from global git config', ({ expect }) => {
    const env = createGitEnv();

    expect(env.GIT_CONFIG_GLOBAL).toBeDefined();
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
  });

  it('does not include identity by default', ({ expect }) => {
    const env = createGitEnv();

    expect(env.GIT_AUTHOR_NAME).toBeUndefined();
    expect(env.GIT_COMMITTER_NAME).toBeUndefined();
  });

  it('includes identity when provided', ({ expect }) => {
    const email = faker.internet.email();
    const name = faker.person.firstName();
    const env = createGitEnv({ email, name });

    expect(env.GIT_AUTHOR_EMAIL).toBe(email);
    expect(env.GIT_AUTHOR_NAME).toBe(name);
    expect(env.GIT_COMMITTER_EMAIL).toBe(email);
    expect(env.GIT_COMMITTER_NAME).toBe(name);
  });
});

describe.concurrent(runCommand, () => {
  it('captures stdout', async ({ expect }) => {
    const result = await runCommand('node', ['-e', 'console.log("hello")'], {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('captures stderr separately', async ({ expect }) => {
    const result = await runCommand('node', ['-e', 'console.error("oops")'], {});

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe('oops');
    expect(result.stdout.trim()).toBe('');
  });

  it('captures non-zero exit code', async ({ expect }) => {
    const result = await runCommand('node', ['-e', 'process.exit(42)'], {});

    expect(result.exitCode).toBe(42);
  });
});

describe.concurrent(formatExecError, () => {
  it('names the command and its exit status', ({ expect }) => {
    const command = faker.word.noun();
    const arg = faker.word.noun();

    const result = formatExecError({
      args: [arg],
      command,
      status: 3,
      stderr: '',
      stdout: '',
    });

    expect(result).toContain(`${command} ${arg}`);
    expect(result).toContain('3');
  });

  it('includes what the child wrote to stderr', ({ expect }) => {
    const marker = faker.string.alphanumeric(12);

    const result = formatExecError({
      args: [],
      command: faker.word.noun(),
      status: 1,
      stderr: `npm error notarget ${marker}`,
      stdout: '',
    });

    expect(result).toContain(marker);
  });

  it('includes what the child wrote to stdout', ({ expect }) => {
    const marker = faker.string.alphanumeric(12);

    const result = formatExecError({
      args: [],
      command: faker.word.noun(),
      status: 1,
      stderr: '',
      stdout: marker,
    });

    expect(result).toContain(marker);
  });

  /*
   * A failed `npm install` can emit far more than a reader needs, and the
   * diagnosis is always at the end. Keeping the tail bounds the message
   * without discarding the part that names the cause.
   */
  it('keeps the tail of long output and says it truncated', ({ expect }) => {
    const first = faker.string.alphanumeric(12);
    const last = faker.string.alphanumeric(12);
    const filler = Array.from({ length: 200 }, () => faker.string.alphanumeric(8));

    const result = formatExecError({
      args: [],
      command: faker.word.noun(),
      status: 1,
      stderr: [first, ...filler, last].join('\n'),
      stdout: '',
    });

    expect(result).toContain(last);
    expect(result).not.toContain(first);
    expect(result).toMatch(/truncat/iv);
  });

  it('stays a single line when the child wrote nothing', ({ expect }) => {
    const result = formatExecError({
      args: [],
      command: faker.word.noun(),
      status: 1,
      stderr: '   \n  ',
      stdout: '',
    });

    expect(result.split('\n')).toHaveLength(1);
  });
});

describe.concurrent(exec, () => {
  it('surfaces the child stderr in the thrown error', ({ expect }) => {
    const marker = faker.string.alphanumeric(12);

    expect(() => {
      exec('node', ['-e', `console.error(${JSON.stringify(marker)}); process.exit(3)`], {});
    }).toThrow(new RegExp(marker, 'v'));
  });

  it('does not throw when the command succeeds', ({ expect }) => {
    expect(() => {
      exec('node', ['-e', 'process.exit(0)'], {});
    }).not.toThrow();
  });
});

describe.concurrent(pinned, () => {
  it('resolves installed package to name@version', ({ expect }) => {
    const result = pinned('valibot');

    expect(result).toMatch(/^valibot@\d+\.\d+\.\d+$/v);
  });

  it('throws for unresolvable package', ({ expect }) => {
    expect(() => pinned('nonexistent-pkg-xyz')).toThrow(/nonexistent-pkg-xyz/v);
  });
});
