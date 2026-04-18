import { defineConfig } from 'eslint/config';
import nodePlugin from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';
import type { PluginFactory } from '../index.ts';
import { resolveParserOptions } from './typescript.ts';

// --- Node.js ---

const nodeFiles = ['**/*.ts', '**/*.mts', '**/*.cts'];

/** Node.js plugin factory. */
const plugin: PluginFactory = options => [
  ...defineConfig({
    extends: [nodePlugin.configs['flat/recommended-module']],
    files: nodeFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: resolveParserOptions(options),
    },
    rules: {
      // Justification: Redundant with TypeScript module resolution
      'n/no-extraneous-import': 'off' as const,
      // Justification: Redundant with TypeScript module resolution
      'n/no-missing-import': 'off' as const,
      // Justification: Redundant with TypeScript module resolution
      'n/no-unpublished-import': 'off' as const,
    },
  }),
  {
    files: [...options.entryPoints],
    rules: {
      // Justification: Entry points use process.exit() for controlled shutdown
      'n/hashbang': 'off',
      // Justification: Entry points use process.exit() for controlled shutdown
      'n/no-process-exit': 'off',
    },
  },
];

export default plugin;
