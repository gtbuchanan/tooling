import { describe, it, vi } from 'vitest';
import type { Linter } from 'eslint';
import { configure } from '@/index.js';

const onlyWarnImport = vi.fn<() => void>();

vi.mock(import('eslint-plugin-only-warn'), () => {
  onlyWarnImport();
  return {};
});

describe('ESLint configure', () => {
  it('imports eslint-plugin-only-warn when onlyWarn is true', async ({ expect }) => {
    onlyWarnImport.mockClear();

    await configure({ onlyWarn: true });

    expect(onlyWarnImport).toHaveBeenCalled();
  });

  it('does not import eslint-plugin-only-warn when onlyWarn is false', async ({ expect }) => {
    onlyWarnImport.mockClear();

    await configure({ onlyWarn: false });

    expect(onlyWarnImport).not.toHaveBeenCalled();
  });

  it('includes pnpm configs by default', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });

    expect(configs.some(cfg => cfg.name?.includes('pnpm'))).toBe(true);
  });

  it('excludes pnpm configs when pnpm is false', async ({ expect }) => {
    const withPnpm = await configure({ onlyWarn: false, pnpm: true });
    const withoutPnpm = await configure({ onlyWarn: false, pnpm: false });

    expect(withPnpm.length).toBeGreaterThan(withoutPnpm.length);
  });

  it('includes oxlint overlay as last configs', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const last = configs.at(-1);

    expect(last?.name).toContain('oxlint');
  });

  it('passes tsconfigRootDir to parser options', async ({ expect }) => {
    const configs = await configure({
      onlyWarn: false,
      tsconfigRootDir: '/my/project',
    });

    const tsConfig = configs.find(config =>
      Object.hasOwn(config.languageOptions ?? {}, 'parserOptions'),
    );

    expect(tsConfig).toHaveProperty(
      'languageOptions.parserOptions.tsconfigRootDir',
      '/my/project',
    );
  });

  it('returns a valid config with default options', async ({ expect }) => {
    const configs = await configure();

    expect(Array.isArray(configs)).toBe(true);
    expect(configs.length).toBeGreaterThan(0);
  });

  it('applies extra configs before oxlint overlay', async ({ expect }) => {
    const extra: Linter.Config = { name: 'test-extra' };
    const configs = await configure({ extraConfigs: [extra], onlyWarn: false });
    const extraIndex = configs.findIndex(cfg => cfg.name === 'test-extra');
    const lastOxlint = configs.at(-1);

    expect(extraIndex).toBeGreaterThan(-1);
    expect(lastOxlint?.name).toContain('oxlint');
    expect(extraIndex).toBeLessThan(configs.length - 1);
  });

  it('applies custom entryPoints to rule overrides', async ({ expect }) => {
    const configs = await configure({
      entryPoints: ['**/cli.ts'],
      onlyWarn: false,
    });
    const entryConfig = configs.find(
      cfg => cfg.rules?.['n/no-process-exit'] === 'off',
    );

    expect(entryConfig?.files).toEqual(['**/cli.ts']);
  });

  it('applies custom ignores', async ({ expect }) => {
    const configs = await configure({ ignores: ['vendor/**'], onlyWarn: false });
    const ignoresConfig = configs.find(
      cfg => cfg.ignores !== undefined && cfg.files === undefined && cfg.name === undefined,
    );

    expect(ignoresConfig?.ignores).toEqual(['vendor/**']);
  });
});
