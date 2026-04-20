import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Linter } from 'eslint';
import format from 'eslint-plugin-format';
import type { PluginFactory } from '../index.ts';

// --- Prettier via ESLint ---

/*
 * ESLint's config array uses structuredClone, which cannot clone plugin
 * objects containing functions. Resolve file:// URLs from this package's
 * dependencies so Prettier's synckit worker can import() them — bare
 * paths fail in worker threads, but file:// URLs work correctly.
 */
const require = createRequire(import.meta.url);
const resolvePlugin = (name: string): string =>
  pathToFileURL(require.resolve(name)).href;

const cssOrderPlugin = resolvePlugin('prettier-plugin-css-order');
const multilineArraysPlugin = resolvePlugin('prettier-plugin-multiline-arrays');
const packageJsonPlugin = resolvePlugin('prettier-plugin-packagejson');
const sortJsonPlugin = resolvePlugin('prettier-plugin-sort-json');
const xmlPlugin = resolvePlugin('@prettier/plugin-xml');

/*
 * Shared JSON overrides: recursive key sorting + one-element-per-line
 * arrays for cleaner diffs. Order matters — multiline-arrays must come
 * after sort-json, otherwise sorting collapses the multiline formatting.
 * https://github.com/electrovir/prettier-plugin-multiline-arrays#compatibility
 */
const jsonPluginOverrides = {
  plugins: [sortJsonPlugin, multilineArraysPlugin],
  jsonRecursiveSort: true,
  multilineArraysWrapThreshold: 0,
} as const;

/** Shared Prettier options aligned with the team style guide. */
const prettierDefaults = {
  endOfLine: 'auto',
  singleQuote: true,
} as const;

const prettierRule = (
  parser: string,
  overrides?: Record<string, unknown>,
): Linter.RulesRecord => ({
  'format/prettier': ['warn', {
    ...prettierDefaults,
    parser,
    ...overrides,
  }],
});

/** Prettier formatting for JSON, Markdown, and YAML via eslint-plugin-format. */
const plugin: PluginFactory = () => [
  {
    files: ['**/*.json'],
    ignores: ['**/package.json', '**/package-lock.json'],
    languageOptions: { parser: format.parserPlain },
    plugins: { format },
    rules: prettierRule('json', jsonPluginOverrides),
  },
  {
    /*
     * package.json uses the json-stringify parser (registered by
     * prettier-plugin-packagejson) for conventional key ordering.
     * multiline-arrays wraps json-stringify's preprocessor, so both
     * plugins compose correctly — unlike parser: 'json', which
     * bypasses packagejson's preprocessing entirely.
     */
    files: ['**/package.json'],
    plugins: { format },
    rules: prettierRule('json-stringify', {
      plugins: [packageJsonPlugin, multilineArraysPlugin],
      multilineArraysWrapThreshold: 0,
    }),
  },
  {
    files: ['**/*.jsonc', '**/tsconfig.json', '**/tsconfig.*.json'],
    languageOptions: { parser: format.parserPlain },
    plugins: { format },
    rules: prettierRule('json', jsonPluginOverrides),
  },
  {
    files: ['**/*.md'],
    languageOptions: { parser: format.parserPlain },
    plugins: { format },
    rules: prettierRule('markdown', {
      /*
       * Justification: Markdown prose should not be hard-wrapped.
       * Hard wrapping creates noisy diffs when text is edited
       * mid-paragraph, and renderers handle soft-wrapping natively.
       */
      proseWrap: 'preserve',
    }),
  },
  {
    files: ['**/*.yaml', '**/*.yml'],
    languageOptions: { parser: format.parserPlain },
    plugins: { format },
    rules: prettierRule('yaml', {
      // HACK: YAML prose is not handled correctly yet
      // https://github.com/prettier/prettier/issues/16126#issuecomment-1987616924
      proseWrap: 'preserve',
    }),
  },
  {
    files: ['**/*.csproj', '**/*.props', '**/*.targets', '**/*.xml', '**/*.xslt'],
    languageOptions: { parser: format.parserPlain },
    plugins: { format },
    rules: prettierRule('xml', {
      plugins: [xmlPlugin],
      // Justification: .csproj, .props, .targets are not whitespace-sensitive
      xmlWhitespaceSensitivity: 'ignore',
    }),
  },
  ...(['css', 'less', 'scss'] as const).map(lang => ({
    files: [`**/*.${lang}`],
    languageOptions: { parser: format.parserPlain },
    plugins: { format },
    rules: prettierRule(lang, {
      plugins: [cssOrderPlugin],
      cssDeclarationSorterOrder: 'alphabetical',
      cssDeclarationSorterKeepOverrides: false,
    }),
  })),
];

export default plugin;
