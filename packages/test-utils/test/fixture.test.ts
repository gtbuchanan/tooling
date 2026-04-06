import { describe, it } from 'vitest';
import { createGitEnv, matchTarball, pinned, runCommand } from '#src/fixture.js';
import { buildOutput, buildRepoFields } from '../../../scripts/lib/manifest.js';

describe(matchTarball, () => {
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

describe(createGitEnv, () => {
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
    const env = createGitEnv({ email: 'test@example.com', name: 'Test' });

    expect(env.GIT_AUTHOR_EMAIL).toBe('test@example.com');
    expect(env.GIT_AUTHOR_NAME).toBe('Test');
    expect(env.GIT_COMMITTER_EMAIL).toBe('test@example.com');
    expect(env.GIT_COMMITTER_NAME).toBe('Test');
  });
});

describe(runCommand, () => {
  it('captures stdout', ({ expect }) => {
    const result = runCommand('node', ['-e', 'console.log("hello")'], {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('captures stderr separately', ({ expect }) => {
    const result = runCommand('node', ['-e', 'console.error("oops")'], {});

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe('oops');
    expect(result.stdout.trim()).toBe('');
  });

  it('captures non-zero exit code', ({ expect }) => {
    const result = runCommand('node', ['-e', 'process.exit(42)'], {});

    expect(result.exitCode).toBe(42);
  });
});

describe(pinned, () => {
  it('resolves installed package to name@version', ({ expect }) => {
    const result = pinned('valibot');

    expect(result).toMatch(/^valibot@\d+\.\d+\.\d+$/v);
  });

  it('throws for unresolvable package', ({ expect }) => {
    expect(() => pinned('nonexistent-pkg-xyz')).toThrow();
  });
});

describe(buildOutput, () => {
  it('strips devDependencies and scripts', ({ expect }) => {
    const result = buildOutput({
      devDependencies: { vitest: '^4.0.0' },
      name: '@test/pkg',
      scripts: { test: 'vitest' },
    });

    expect(result).not.toHaveProperty('devDependencies');
    expect(result).not.toHaveProperty('scripts');
    expect(result).toHaveProperty('name', '@test/pkg');
  });

  it('remaps publishConfig.exports to top-level exports', ({ expect }) => {
    const result = buildOutput({
      exports: { '.': './src/index.ts' },
      publishConfig: {
        exports: { '.': './index.js' },
      },
    });

    expect(result['exports']).toEqual({ '.': './index.js' });
  });

  it('remaps publishConfig.scripts to top-level scripts', ({ expect }) => {
    const result = buildOutput({
      publishConfig: {
        scripts: { postinstall: 'echo done' },
      },
      scripts: { test: 'vitest' },
    });

    expect(result.scripts).toEqual({ postinstall: 'echo done' });
  });

  it('strips publishConfig from output', ({ expect }) => {
    const result = buildOutput({
      publishConfig: {
        directory: 'dist/source',
        exports: { '.': './index.js' },
      },
    });

    expect(result).not.toHaveProperty('publishConfig');
  });

  it('preserves other fields via looseObject passthrough', ({ expect }) => {
    const result = buildOutput({
      dependencies: { valibot: '^1.0.0' },
      name: '@test/pkg',
      version: '1.0.0',
    });

    expect(result).toHaveProperty('name', '@test/pkg');
    expect(result).toHaveProperty('version', '1.0.0');
    expect(result).toHaveProperty('dependencies');
  });
});

describe(buildRepoFields, () => {
  it('builds all fields from root manifest', ({ expect }) => {
    const result = buildRepoFields({
      bugs: 'https://github.com/test/repo/issues',
      homepage: 'https://github.com/test/repo',
      repository: {
        type: 'git',
        url: 'https://github.com/test/repo.git',
      },
    }, 'packages/foo');

    expect(result).toEqual({
      bugs: 'https://github.com/test/repo/issues',
      homepage: 'https://github.com/test/repo/tree/main/packages/foo',
      repository: {
        directory: 'packages/foo',
        type: 'git',
        url: 'https://github.com/test/repo.git',
      },
    });
  });

  it('returns empty object when root has no fields', ({ expect }) => {
    expect(buildRepoFields({}, 'packages/foo')).toEqual({});
  });

  it('includes only fields present in root', ({ expect }) => {
    const result = buildRepoFields({
      homepage: 'https://github.com/test/repo',
    }, 'packages/bar');

    expect(result).toEqual({
      homepage: 'https://github.com/test/repo/tree/main/packages/bar',
    });
  });
});
