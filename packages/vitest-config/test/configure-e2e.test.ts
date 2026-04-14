import { describe, it } from 'vitest';
import {
  configureEndToEnd,
  configureEndToEndGlobal,
  configureEndToEndPackage,
  configureEndToEndProject,
} from '#src/configure-e2e.js';
import { excludeDefault } from '#src/configure.js';

const packageName = '@gtbuchanan/vitest-config';

describe('vitest configureEndToEndProject', () => {
  it('does not include resolve alias', ({ expect }) => {
    const config = configureEndToEndProject();

    expect(config.resolve).toBeUndefined();
  });

  it('includes e2e test pattern', ({ expect }) => {
    const config = configureEndToEndProject();

    expect(config.test?.include).toEqual(['e2e/**/*.test.ts']);
  });

  it('excludes defaults', ({ expect }) => {
    const config = configureEndToEndProject();

    expect(config.test?.exclude).toEqual([...excludeDefault]);
  });

  it('does not include setup files', ({ expect }) => {
    const config = configureEndToEndProject();

    expect(config.test?.setupFiles).toBeUndefined();
  });

  it('does not include coverage', ({ expect }) => {
    const config = configureEndToEndProject();

    expect(config.test).not.toHaveProperty('coverage');
  });
});

describe('vitest configureEndToEndGlobal', () => {
  it('does not include coverage', ({ expect }) => {
    const config = configureEndToEndGlobal();

    expect(config.test?.coverage).toBeUndefined();
  });

  it('includes both setup files by default', ({ expect }) => {
    const config = configureEndToEndGlobal();

    expect(config.test?.setupFiles).toEqual([
      `${packageName}/console-fail-test`,
      `${packageName}/setup`,
    ]);
  });

  it('excludes console-fail-test when disabled', ({ expect }) => {
    const config = configureEndToEndGlobal({ consoleFailTest: false });
    const setupFiles = config.test?.setupFiles ?? [];

    expect(setupFiles).not.toContainEqual(
      expect.stringContaining('console-fail-test'),
    );
  });

  it('excludes hasAssertions when disabled', ({ expect }) => {
    const config = configureEndToEndGlobal({ hasAssertions: false });
    const setupFiles = config.test?.setupFiles ?? [];

    expect(setupFiles).not.toContainEqual(
      expect.stringContaining('setup'),
    );
  });

  it('defaults testTimeout to 300000', ({ expect }) => {
    const config = configureEndToEndGlobal();

    expect(config.test?.testTimeout).toBe(300_000);
  });

  it('accepts custom testTimeout', ({ expect }) => {
    const config = configureEndToEndGlobal({ testTimeout: 60_000 });

    expect(config.test?.testTimeout).toBe(60_000);
  });

  it('enables mockReset', ({ expect }) => {
    const config = configureEndToEndGlobal();

    expect(config.test?.mockReset).toBe(true);
  });

  it('enables unstubEnvs', ({ expect }) => {
    const config = configureEndToEndGlobal();

    expect(config.test?.unstubEnvs).toBe(true);
  });

  it('does not include alias', ({ expect }) => {
    const config = configureEndToEndGlobal();

    expect(config.resolve?.alias).toBeUndefined();
  });

  it('does not include projects without projects option', ({ expect }) => {
    const config = configureEndToEndGlobal();

    expect(config.test).not.toHaveProperty('projects');
  });
});

describe('vitest configureEndToEndPackage', () => {
  it('includes e2e test patterns', ({ expect }) => {
    const config = configureEndToEndPackage();

    expect(config.test?.include).toEqual(['e2e/**/*.test.ts']);
  });

  it('includes global settings (setupFiles, mockReset)', ({ expect }) => {
    const config = configureEndToEndPackage();

    expect(config.test?.setupFiles).toBeDefined();
    expect(config.test?.mockReset).toBe(true);
  });

  it('does not include coverage', ({ expect }) => {
    const config = configureEndToEndPackage();

    expect(config.test?.coverage).toBeUndefined();
  });

  it('includes testTimeout', ({ expect }) => {
    const config = configureEndToEndPackage();

    expect(config.test?.testTimeout).toBe(300_000);
  });

  it('accepts custom testTimeout', ({ expect }) => {
    const config = configureEndToEndPackage({ testTimeout: 120_000 });

    expect(config.test?.testTimeout).toBe(120_000);
  });

  it('includes default excludes', ({ expect }) => {
    const config = configureEndToEndPackage();

    expect(config.test?.exclude).toContain('**/dist/**');
  });
});

describe('vitest configureEndToEnd', () => {
  it('merges global and project settings', ({ expect }) => {
    const config = configureEndToEnd();

    expect(config.test?.setupFiles).toBeDefined();
    expect(config.test?.mockReset).toBe(true);
    expect(config.test?.unstubEnvs).toBe(true);
    expect(config.test?.exclude).toBeDefined();
  });

  it('does not include coverage', ({ expect }) => {
    const config = configureEndToEnd();

    expect(config.test?.coverage).toBeUndefined();
  });

  it('includes testTimeout', ({ expect }) => {
    const config = configureEndToEnd();

    expect(config.test?.testTimeout).toBe(300_000);
  });

  it('accepts custom testTimeout', ({ expect }) => {
    const config = configureEndToEnd({ testTimeout: 120_000 });

    expect(config.test?.testTimeout).toBe(120_000);
  });

  it('uses default include (no monorepo-specific pattern)', ({ expect }) => {
    const config = configureEndToEnd();

    expect(config.test?.include).toBeUndefined();
  });
});
