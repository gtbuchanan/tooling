import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import {
  createGitEnv, matchTarball, npmInstallArgs, pinned, runCommand,
} from '#src/fixture.js';
import { exec, formatExecError } from '#src/lib/command.js';

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
