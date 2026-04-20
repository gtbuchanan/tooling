import { describe, it } from 'vitest';
import {
  buildWorkspaceEntry,
  configure,
  configureGlobal,
  configurePackage,
  configureProject,
  coverageInclude,
  defaultCoverageDirs,
  excludeDefault,
  resolveCoverageInclude,
} from '#src/index.js';

const allScriptExtensions = ['cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx'];
const expectedUnitTestInclude = allScriptExtensions.map(
  ext => `test/**/*.test.${ext}`,
);

const packageName = '@gtbuchanan/vitest-config';

describe(configure, () => {
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

  it('excludes .claude and dist from test and coverage', ({ expect }) => {
    expect(excludeDefault).toContain('.claude/worktrees/**');
    expect(excludeDefault).toContain('**/dist/**');
  });

  it('includes both setup files by default', ({ expect }) => {
    const config = configure();

    expect(config.test?.setupFiles).toStrictEqual([
      `${packageName}/console-fail-test`,
      `${packageName}/setup`,
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

    expect(config.test?.setupFiles).toStrictEqual([]);
  });

  it('does not include resolve alias', ({ expect }) => {
    const config = configure();

    expect(config.resolve?.alias).toBeUndefined();
  });

  it('preserves all expected properties after merge', ({ expect }) => {
    const config = configure();

    expect(config.test?.coverage?.provider).toBe('v8');
    expect(config.test?.setupFiles).toBeDefined();
    expect(config.test?.mockReset).toBe(true);
    expect(config.test?.unstubEnvs).toBe(true);
    expect(config.test?.exclude).toBeDefined();
  });

  it('uses default include (no monorepo-specific pattern)', ({ expect }) => {
    const config = configure();

    expect(config.test?.include).toBeUndefined();
  });

  it('enables coverage', ({ expect }) => {
    const config = configure();

    expect(config.test?.coverage?.enabled).toBe(true);
  });

  it('configures slow tag', ({ expect }) => {
    const config = configure();

    expect(config.test?.tags).toStrictEqual([
      { name: 'slow', timeout: 300_000 },
    ]);
  });
});

describe(configureGlobal, () => {
  it('includes setup files', ({ expect }) => {
    const config = configureGlobal();

    expect(config.test?.setupFiles).toStrictEqual([
      `${packageName}/console-fail-test`,
      `${packageName}/setup`,
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

  it('enables coverage', ({ expect }) => {
    const config = configureGlobal();

    expect(config.test?.coverage?.enabled).toBe(true);
  });

  it('uses lcov coverage reporter', ({ expect }) => {
    const config = configureGlobal();
    const reporter = config.test?.coverage?.reporter?.[0];

    expect(reporter?.[0]).toBe('lcov');

    const options = reporter?.[1];

    expect(options).toBeTypeOf('object');
    expect(options).toHaveProperty('projectRoot', expect.any(String));
  });

  it('configures slow tag with default timeout', ({ expect }) => {
    const config = configureGlobal();

    expect(config.test?.tags).toStrictEqual([
      { name: 'slow', timeout: 300_000 },
    ]);
  });

  it('accepts custom slow tag timeout', ({ expect }) => {
    const config = configureGlobal({ slow: { timeout: 600_000 } });

    expect(config.test?.tags).toStrictEqual([
      { name: 'slow', timeout: 600_000 },
    ]);
  });

  it('merges custom tags with built-in slow tag', ({ expect }) => {
    const config = configureGlobal({
      tags: [{ name: 'db', timeout: 60_000 }],
    });

    expect(config.test?.tags).toStrictEqual([
      { name: 'slow', timeout: 300_000 },
      { name: 'db', timeout: 60_000 },
    ]);
  });
});

describe(resolveCoverageInclude, () => {
  it('returns default patterns without projects', ({ expect }) => {
    expect(resolveCoverageInclude()).toStrictEqual([...coverageInclude]);
  });

  it('includes per-project and root-level patterns', ({ expect }) => {
    const result = resolveCoverageInclude(['packages/*']);

    expect(result).toStrictEqual([
      ...coverageInclude.map(pattern => `packages/*/${pattern}`),
      ...coverageInclude,
    ]);
  });

  it('handles multiple project patterns', ({ expect }) => {
    const result = resolveCoverageInclude(['apps/*', 'libs/*']);

    expect(result).toStrictEqual([
      ...coverageInclude.map(pattern => `apps/*/${pattern}`),
      ...coverageInclude.map(pattern => `libs/*/${pattern}`),
      ...coverageInclude,
    ]);
  });

  it('respects custom coverage dirs', ({ expect }) => {
    const result = resolveCoverageInclude(undefined, ['src']);

    expect(result).toStrictEqual(['src/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}']);
  });

  it('includes all default dirs', ({ expect }) => {
    expect(defaultCoverageDirs).toStrictEqual(['bin', 'scripts', 'src']);
  });
});

describe(buildWorkspaceEntry, () => {
  it('adds name from directory basename', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.name).toBe('my-package');
  });

  it('adds root from directory path', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.root).toBe('/path/to/my-package');
  });

  it('does not include resolve alias', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.resolve).toBeUndefined();
  });

  it('preserves includes from configure function', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.include).toStrictEqual(expectedUnitTestInclude);
  });

  it('preserves excludes from configure function', ({ expect }) => {
    const entry = buildWorkspaceEntry('/path/to/my-package', configureProject);

    expect(entry.test?.exclude).toStrictEqual([...excludeDefault]);
  });
});

describe(configureProject, () => {
  it('does not include resolve alias', ({ expect }) => {
    const config = configureProject();

    expect(config.resolve).toBeUndefined();
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

describe(configurePackage, () => {
  it('includes test patterns', ({ expect }) => {
    const config = configurePackage();

    expect(config.test?.include).toStrictEqual(expectedUnitTestInclude);
  });

  it('includes global settings (coverage, setupFiles)', ({ expect }) => {
    const config = configurePackage();

    expect(config.test?.coverage?.enabled).toBe(true);
    expect(config.test?.setupFiles).toBeDefined();
    expect(config.test?.mockReset).toBe(true);
  });

  it('includes blob reporter', ({ expect }) => {
    const config = configurePackage();

    expect(config.test?.reporters).toContain('blob');
    expect(config.test?.outputFile).toHaveProperty('blob');
  });

  it('includes default excludes', ({ expect }) => {
    const config = configurePackage();

    expect(config.test?.exclude).toContain('**/dist/**');
  });
});
