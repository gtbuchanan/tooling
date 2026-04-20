import { describe, it, vi } from 'vitest';
import { configure, defaultEntryPoints } from '#src/index.js';

/**
 * All script file extensions that plugin configs should target.
 * Defined inline so tests don't depend on implementation.
 */
const allScriptExtensions = ['cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx'];
const jsOnlyExtensions = ['cjs', 'js', 'jsx', 'mjs'];
const tsOnlyExtensions = ['cts', 'mts', 'ts', 'tsx'];

const onlyWarnImport = vi.fn<() => void>();

vi.mock(import('eslint-plugin-only-warn'), () => {
  onlyWarnImport();
  return {};
});

describe(configure, () => {
  it('imports eslint-plugin-only-warn when onlyWarn is true', async ({ expect }) => {
    onlyWarnImport.mockClear();

    await configure({ onlyWarn: true });

    expect(onlyWarnImport).toHaveBeenCalledWith();
  });

  it('does not import eslint-plugin-only-warn when onlyWarn is false', async ({ expect }) => {
    onlyWarnImport.mockClear();

    await configure({ onlyWarn: false });

    expect(onlyWarnImport).not.toHaveBeenCalled();
  });

  it('includes json configs', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });

    expect(configs.some(cfg => cfg.language === 'json/json')).toBe(true);
    expect(configs.some(cfg => cfg.language === 'json/jsonc')).toBe(true);
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

  it('applies custom entryPoints to rule overrides', async ({ expect }) => {
    const configs = await configure({
      entryPoints: ['**/cli.ts'],
      onlyWarn: false,
    });
    const entryConfig = configs.find(
      cfg => cfg.rules?.['n/no-process-exit'] === 'off',
    );

    expect(entryConfig?.files).toStrictEqual(['**/cli.ts']);
  });

  it('applies custom ignores', async ({ expect }) => {
    const configs = await configure({ ignores: ['vendor/**'], onlyWarn: false });
    const ignoresConfig = configs.find(
      cfg => cfg.ignores !== undefined && cfg.files === undefined && cfg.name === undefined,
    );

    expect(ignoresConfig?.ignores).toStrictEqual(['vendor/**']);
  });

  it('includes format/prettier for all supported file types', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });

    const formatConfigs = configs.filter(
      cfg => cfg.rules?.['format/prettier'] !== undefined,
    );
    const targetedFiles = formatConfigs.flatMap(
      cfg => cfg.files ?? [],
    );

    expect(targetedFiles).toStrictEqual(expect.arrayContaining([
      '**/*.css', '**/*.json', '**/*.md',
      '**/*.scss', '**/*.xml', '**/*.yaml',
      '**/package.json',
    ]));
  });

  it('type-checks all script file extensions', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const disableConfig = configs.find(cfg =>
      cfg.files?.includes('**/*') && cfg.ignores?.includes('**/*.ts'),
    );

    for (const ext of allScriptExtensions) {
      expect(disableConfig?.ignores).toContain(`**/*.${ext}`);
    }
  });

  it('applies core rules to all script file extensions', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const coreConfig = configs.find(
      cfg => cfg.rules?.['class-methods-use-this'] !== undefined,
    );

    for (const ext of allScriptExtensions) {
      expect(coreConfig?.files).toContain(`**/*.${ext}`);
    }
  });

  it('applies import ordering to all script file extensions', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const importConfig = configs.find(
      cfg => cfg.rules?.['import-x/order'] !== undefined,
    );

    for (const ext of allScriptExtensions) {
      expect(importConfig?.files).toContain(`**/*.${ext}`);
    }
  });

  it('applies node rules to all script file extensions', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const nodeConfig = configs.find(
      cfg => cfg.rules?.['n/no-extraneous-import'] === 'off',
    );

    for (const ext of allScriptExtensions) {
      expect(nodeConfig?.files).toContain(`**/*.${ext}`);
    }
  });

  it('applies vitest rules to test files with all script extensions', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const vitestConfig = configs.find(
      cfg => cfg.rules?.['vitest/prefer-lowercase-title'] !== undefined,
    );

    for (const dir of ['**/test', '**/e2e']) {
      for (const ext of allScriptExtensions) {
        expect(vitestConfig?.files).toContain(`${dir}/**/*.${ext}`);
      }
    }
  });

  it('covers all script extensions in default entry points', ({ expect }) => {
    for (const dir of ['**/bin', '**/scripts']) {
      for (const ext of allScriptExtensions) {
        expect(defaultEntryPoints).toContain(`${dir}/**/*.${ext}`);
      }
    }
  });

  it('scopes TS-syntax rules to TypeScript files only', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const tsOnlyConfig = configs.find(
      cfg => cfg.rules?.['@typescript-eslint/consistent-type-exports'] !== undefined,
    );

    for (const ext of tsOnlyExtensions) {
      expect(tsOnlyConfig?.files).toContain(`**/*.${ext}`);
    }
    for (const ext of jsOnlyExtensions) {
      expect(tsOnlyConfig?.files).not.toContain(`**/*.${ext}`);
    }
  });

  it('scopes jsdoc/tsdoc rules to TypeScript files only', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });
    const jsdocConfig = configs.find(
      cfg => cfg.rules?.['jsdoc/check-tag-names'] !== undefined,
    );

    for (const ext of tsOnlyExtensions) {
      expect(jsdocConfig?.files).toContain(`**/*.${ext}`);
    }
    for (const ext of jsOnlyExtensions) {
      expect(jsdocConfig?.files).not.toContain(`**/*.${ext}`);
    }
  });
});
