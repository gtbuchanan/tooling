import { describe, it } from 'vitest';
import { configure, defaultEntryPoints } from '#src/index.js';

const isAndroid = process.platform === 'android';

describe('oxlint configure', () => {
  it.runIf(!isAndroid)('includes jsPlugins with defaults', ({ expect }) => {
    const config = configure();

    expect(config.jsPlugins).toEqual(
      expect.arrayContaining([
        expect.stringContaining('stylistic'),
        expect.stringContaining('eslint-comments'),
      ]),
    );
  });

  it.runIf(isAndroid)('omits jsPlugins on Android', ({ expect }) => {
    const config = configure();

    expect(config.jsPlugins).toBeUndefined();
  });

  it('returns a valid config with defaults', ({ expect }) => {
    const config = configure();

    expect(config.plugins).toContain('typescript');
    expect(config.plugins).toContain('import');
    expect(config.plugins).toContain('node');
    expect(config.categories).toBeDefined();
    expect(config.options?.typeAware).toBe(true);
    expect(config.options?.denyWarnings).toBe(true);
  });

  it('sets all categories to warn', ({ expect }) => {
    const config = configure();

    expect(config.categories?.correctness).toBe('warn');
    expect(config.categories?.suspicious).toBe('warn');
    expect(config.categories?.pedantic).toBe('warn');
    expect(config.categories?.style).toBe('warn');
    expect(config.categories?.perf).toBe('warn');
  });

  it('allows overriding categories', ({ expect }) => {
    const config = configure({ categories: { correctness: 'error' } });

    expect(config.categories?.correctness).toBe('error');
    expect(config.categories?.suspicious).toBe('warn');
  });

  it('allows overriding ignorePatterns', ({ expect }) => {
    const config = configure({ ignorePatterns: ['vendor/**'] });

    expect(config.ignorePatterns).toEqual(['vendor/**']);
  });

  it('defaults ignorePatterns to .claude and dist', ({ expect }) => {
    const config = configure();

    expect(config.ignorePatterns).toEqual(['.claude/worktrees/**', '**/dist/**']);
  });

  it('allows overriding options', ({ expect }) => {
    const config = configure({ options: { typeAware: false } });

    expect(config.options?.typeAware).toBe(false);
    expect(config.options?.denyWarnings).toBe(true);
  });

  it('includes vitest override for test files', ({ expect }) => {
    const config = configure();
    const vitestOverride = config.overrides?.find(
      override => override.plugins?.includes('vitest'),
    );

    expect(vitestOverride).toBeDefined();
    expect(vitestOverride?.files).toEqual(['**/test/**/*.ts', '**/e2e/**/*.ts']);
    expect(vitestOverride?.rules?.['typescript/unbound-method']).toBe('off');
  });

  it('appends custom overrides after vitest', ({ expect }) => {
    const custom = {
      files: ['src/**/*.ts'],
      rules: { 'typescript/no-explicit-any': 'off' as const },
    };
    const config = configure({ overrides: [custom] });
    const last = config.overrides?.at(-1);

    expect(last).toEqual(custom);
  });

  it.runIf(!isAndroid)('includes eslint-comments rules', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@eslint-community/eslint-comments/disable-enable-pair']).toBe('warn');
    expect(config.rules?.['@eslint-community/eslint-comments/require-description']).toBeDefined();
  });

  it.runIf(!isAndroid)('includes stylistic rules', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@stylistic/semi']).toBeDefined();
  });

  it.runIf(!isAndroid)('enforces 1tbs brace style', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@stylistic/brace-style']).toEqual([
      'warn',
      '1tbs',
      { allowSingleLine: true },
    ]);
  });

  it.runIf(isAndroid)('omits stylistic rules on Android', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@stylistic/semi']).toBeUndefined();
    expect(config.rules?.['@stylistic/max-len']).toBeUndefined();
  });

  it.runIf(!isAndroid)('allows customizing stylistic options', ({ expect }) => {
    const withSemi = configure({ stylistic: { semi: true } });
    const withoutSemi = configure({ stylistic: { semi: false } });

    expect(withSemi.rules?.['@stylistic/semi']).toBeDefined();
    expect(withoutSemi.rules?.['@stylistic/semi']).toBeDefined();
    expect(withSemi.rules?.['@stylistic/semi']).not.toEqual(
      withoutSemi.rules?.['@stylistic/semi'],
    );
  });

  it('enables no-param-reassign with props', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['no-param-reassign']).toEqual(['warn', { props: true }]);
  });

  it('includes promise plugin', ({ expect }) => {
    const config = configure();

    expect(config.plugins).toContain('promise');
  });

  it('enables promise rules', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['promise/no-multiple-resolved']).toBe('warn');
    expect(config.rules?.['promise/no-return-wrap']).toBe('warn');
    expect(config.rules?.['promise/param-names']).toBe('warn');
  });

  it('disables conflicting import rules', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['import/consistent-type-specifier-style']).toBe('off');
    expect(config.rules?.['import/exports-last']).toBe('off');
    expect(config.rules?.['import/group-exports']).toBe('off');
    expect(config.rules?.['import/no-named-export']).toBe('off');
    expect(config.rules?.['import/prefer-default-export']).toBe('off');
  });

  it('disables no-continue', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['no-continue']).toBe('off');
  });

  it.runIf(!isAndroid)('sets max-len to 100', ({ expect }) => {
    const config = configure();
    const maxLen = config.rules?.['@stylistic/max-len'];

    expect(maxLen).toEqual(['warn', { code: 100, ignoreUrls: true }]);
  });

  it.runIf(!isAndroid)('enforces single quotes', ({ expect }) => {
    const config = configure();
    const quotes = config.rules?.['@stylistic/quotes'];

    expect(quotes).toEqual([
      'warn',
      'single',
      { allowTemplateLiterals: 'avoidEscape', avoidEscape: true },
    ]);
  });

  it('allows common sentinel values in no-magic-numbers', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['no-magic-numbers']).toEqual([
      'warn',
      {
        ignore: [-1, 0, 1, 100],
        ignoreDefaultValues: true,
        ignoreEnums: true,
        ignoreNumericLiteralTypes: true,
        ignoreTypeIndexes: true,
      },
    ]);
  });

  it('explicitly disables nursery and restriction categories', ({ expect }) => {
    const config = configure();

    expect(config.categories?.nursery).toBe('off');
    expect(config.categories?.restriction).toBe('off');
  });

  it('defaults to server target without no-console', ({ expect }) => {
    const config = configure();
    const consoleOverride = config.overrides?.find(
      override => override.rules?.['no-console'] !== undefined,
    );

    expect(consoleOverride).toBeUndefined();
  });

  it('enables no-console and no-alert for browser target', ({ expect }) => {
    const config = configure({ target: 'browser' });
    const browserOverride = config.overrides?.find(
      override => override.rules?.['no-console'] !== undefined,
    );

    expect(browserOverride?.rules?.['no-console']).toBe('warn');
    expect(browserOverride?.rules?.['no-alert']).toBe('warn');
  });

  it('exempts scripts and bin from no-console in browser target', ({ expect }) => {
    const config = configure({ target: 'browser' });
    const exemption = config.overrides?.find(
      override => override.rules?.['no-console'] === 'off',
    );

    expect(exemption?.files).toContain('**/scripts/**/*.ts');
    expect(exemption?.files).toContain('**/bin/**/*.ts');
  });

  it('enables class-methods-use-this', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['class-methods-use-this']).toBe('warn');
  });

  it('exports defaultEntryPoints with bin and scripts', ({ expect }) => {
    expect(defaultEntryPoints).toEqual([
      '**/bin/**/*.ts',
      '**/scripts/**/*.ts',
    ]);
  });

  it('disables import/no-nodejs-modules for server target', ({ expect }) => {
    const config = configure();
    const nodeModulesOverride = config.overrides?.find(
      override => override.rules?.['import/no-nodejs-modules'] === 'off' &&
        override.files.includes('**/*.ts'),
    );

    expect(nodeModulesOverride).toBeDefined();
  });

  it('does not disable import/no-nodejs-modules globally for browser target', ({ expect }) => {
    const config = configure({ target: 'browser' });
    const globalDisable = config.overrides?.find(
      override => override.rules?.['import/no-nodejs-modules'] === 'off' &&
        override.files.includes('**/*.ts') &&
        !override.rules['no-console'],
    );

    expect(globalDisable).toBeUndefined();
  });

  it('exempts entry points from import/no-nodejs-modules in browser target', ({ expect }) => {
    const config = configure({ target: 'browser' });
    const exemption = config.overrides?.find(
      override => override.rules?.['import/no-nodejs-modules'] === 'off' &&
        override.rules['no-console'] === 'off',
    );

    expect(exemption?.files).toContain('**/bin/**/*.ts');
    expect(exemption?.files).toContain('**/scripts/**/*.ts');
  });

  it('uses custom entryPoints for browser exemptions', ({ expect }) => {
    const custom = ['**/cli/**/*.ts'];
    const config = configure({ entryPoints: custom, target: 'browser' });
    const exemption = config.overrides?.find(
      override => override.rules?.['import/no-nodejs-modules'] === 'off',
    );

    expect(exemption?.files).toEqual(custom);
  });
});
