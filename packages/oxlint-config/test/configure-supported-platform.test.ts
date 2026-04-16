import { describe, it, vi } from 'vitest';
import { configure } from '#src/index.js';

vi.mock(import('#src/platform.js'), () => ({ jsPluginsSupported: true }));

describe('configure on supported platforms', () => {
  it('includes jsPlugins', ({ expect }) => {
    const config = configure();

    expect(config.jsPlugins).toEqual(
      expect.arrayContaining([
        expect.stringContaining('stylistic'),
        expect.stringContaining('eslint-comments'),
      ]),
    );
  });

  it('includes eslint-comments rules', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@eslint-community/eslint-comments/disable-enable-pair']).toBe('warn');
    expect(config.rules?.['@eslint-community/eslint-comments/require-description']).toBeDefined();
  });

  it('includes stylistic rules', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@stylistic/semi']).toBeDefined();
  });

  it('enforces 1tbs brace style', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@stylistic/brace-style']).toEqual([
      'warn',
      '1tbs',
      { allowSingleLine: true },
    ]);
  });

  it('allows customizing stylistic options', ({ expect }) => {
    const withSemi = configure({ stylistic: { semi: true } });
    const withoutSemi = configure({ stylistic: { semi: false } });

    expect(withSemi.rules?.['@stylistic/semi']).toBeDefined();
    expect(withoutSemi.rules?.['@stylistic/semi']).toBeDefined();
    expect(withSemi.rules?.['@stylistic/semi']).not.toEqual(
      withoutSemi.rules?.['@stylistic/semi'],
    );
  });

  it('sets max-len to 100', ({ expect }) => {
    const config = configure();
    const maxLen = config.rules?.['@stylistic/max-len'];

    expect(maxLen).toEqual(['warn', { code: 100, ignoreUrls: true }]);
  });

  it('enforces single quotes', ({ expect }) => {
    const config = configure();
    const quotes = config.rules?.['@stylistic/quotes'];

    expect(quotes).toEqual([
      'warn',
      'single',
      { allowTemplateLiterals: 'avoidEscape', avoidEscape: true },
    ]);
  });
});
