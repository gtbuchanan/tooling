import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import {
  createGitEnv, matchTarball, npmInstallArgs, pinned, runCommand,
} from '#src/fixture.js';

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
    const result = npmInstallArgs([faker.word.noun()]);

    expect(result).toStrictEqual(
      expect.arrayContaining(['--prefer-offline', '--no-audit', '--no-fund']),
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

describe.concurrent(pinned, () => {
  it('resolves installed package to name@version', ({ expect }) => {
    const result = pinned('valibot');

    expect(result).toMatch(/^valibot@\d+\.\d+\.\d+$/v);
  });

  it('throws for unresolvable package', ({ expect }) => {
    expect(() => pinned('nonexistent-pkg-xyz')).toThrow(/nonexistent-pkg-xyz/v);
  });
});
