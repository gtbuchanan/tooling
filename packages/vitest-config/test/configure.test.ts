import {
  buildWorkspaceEntry,
  configure,
  configureGlobal,
  configureProject,
  excludeDefault,
} from '@/index.js';
import { describe, it } from 'vitest';
import { join } from 'node:path';

const PACKAGE_NAME = '@gtbuchanan/vitest-config';

describe('vitest configure', () => {
  it('enables mockReset by default', ({ expect }) => {
    const config = configure();

    expect(config.test?.mockReset).toBe(true);
  });

  it('enables unstubEnvs by default', ({ expect }) => {
    const config = configure();

    expect(config.test?.unstubEnvs).toBe(true);
  });

  it('uses v8 coverage provider', ({ expect }) => {
    const config = configure();

    expect(config.test?.coverage?.provider).toBe('v8');
  });

  it('excludes dist from test and coverage', ({ expect }) => {
    expect(excludeDefault).toContain('**/dist/**');
  });

  it('includes both setup files by default', ({ expect }) => {
    const config = configure();

    expect(config.test?.setupFiles).toEqual([
      `${PACKAGE_NAME}/console-fail-test`,
      `${PACKAGE_NAME}/setup`,
    ]);
  });

  it('excludes console-fail-test when disabled', ({ expect }) => {
    const config = configure({ consoleFailTest: false });
    const setupFiles = config.test?.setupFiles ?? [];

    expect(setupFiles).not.toContainEqual(
      expect.stringContaining('console-fail-test'),
    );
    expect(setupFiles).toContainEqual(
      expect.stringContaining('setup'),
    );
  });

  it('excludes hasAssertions when disabled', ({ expect }) => {
    const config = configure({ hasAssertions: false });
    const setupFiles = config.test?.setupFiles ?? [];

    expect(setupFiles).toContainEqual(
      expect.stringContaining('console-fail-test'),
    );
    expect(setupFiles).not.toContainEqual(
      expect.stringContaining('/setup'),
    );
  });

  it('excludes both setup files when both disabled', ({ expect }) => {
    const config = configure({ consoleFailTest: false, hasAssertions: false });

    expect(config.test?.setupFiles).toEqual([]);
  });

  it('sets @ alias to cwd/src', ({ expect }) => {
    const config = configure();

    expect(config.resolve?.alias).toHaveProperty('@', join(process.cwd(), 'src'));
  });

  it('preserves all expected properties after merge', ({ expect }) => {
    const config = configure();

    expect(config.test?.coverage?.provider).toBe('v8');
    expect(config.test?.setupFiles).toBeDefined();
    expect(config.test?.mockReset).toBe(true);
    expect(config.test?.unstubEnvs).toBe(true);
    expect(config.test?.exclude).toBeDefined();
    expect(config.resolve?.alias).toHaveProperty('@');
  });

  it('uses default include (no monorepo-specific pattern)', ({ expect }) => {
    const config = configure();

    expect(config.test?.include).toBeUndefined();
  });
});

describe('vitest configureGlobal', () => {
  it('includes setup files', ({ expect }) => {
    const config = configureGlobal();

    expect(config.test?.setupFiles).toEqual([
      `${PACKAGE_NAME}/console-fail-test`,
      `${PACKAGE_NAME}/setup`,
    ]);
  });

  it('does not include alias', ({ expect }) => {
    const config = configureGlobal();

    expect(config.resolve?.alias).toBeUndefined();
  });

  it('respects consoleFailTest option', ({ expect }) => {
    const config = configureGlobal({ consoleFailTest: false });
    const setupFiles = config.test?.setupFiles ?? [];

    expect(setupFiles).not.toContainEqual(
      expect.stringContaining('console-fail-test'),
    );
  });

  it('respects hasAssertions option', ({ expect }) => {
    const config = configureGlobal({ hasAssertions: false });
    const setupFiles = config.test?.setupFiles ?? [];

    expect(setupFiles).not.toContainEqual(
      expect.stringContaining('setup'),
    );
  });

  it('does not include workspace without projects', ({ expect }) => {
    const config = configureGlobal();

    expect(config.test).not.toHaveProperty('projects');
  });
});

describe('buildWorkspaceEntry', () => {
  it('adds name from directory basename', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.name).toBe('my-package');
  });

  it('adds root from directory path', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.root).toBe('/path/to/my-package');
  });

  it('preserves alias from configure function', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.resolve?.alias).toHaveProperty('@', join('/path/to/my-package', 'src'));
  });

  it('preserves includes from configure function', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.include).toEqual(['test/**/*.test.ts']);
  });

  it('preserves excludes from configure function', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.exclude).toEqual([...excludeDefault]);
  });
});

describe('vitest configureProject', () => {
  it('sets @ alias to cwd/src by default', ({ expect }) => {
    const config = configureProject();

    expect(config.resolve?.alias).toHaveProperty('@', join(process.cwd(), 'src'));
  });

  it('sets @ alias relative to custom root', ({ expect }) => {
    const config = configureProject('/custom/root');

    expect(config.resolve?.alias).toHaveProperty('@', join('/custom/root', 'src'));
  });

  it('does not include setup files', ({ expect }) => {
    const config = configureProject();

    expect(config.test?.setupFiles).toBeUndefined();
  });

  it('does not include coverage', ({ expect }) => {
    const config = configureProject();

    expect(config.test).not.toHaveProperty('coverage');
  });
});
