import type { Linter } from 'eslint';
import importPlugin from 'eslint-plugin-import-x';
import type { PluginFactory } from '../index.ts';

// --- import-x (ordering only) ---

/** Import ordering rules via eslint-plugin-import-x. */
const importConfig: Linter.Config = {
  files: ['**/*.ts'],
  plugins: { 'import-x': importPlugin },
  rules: {
    // Justification: Case-insensitive alphabetical grouping by import type
    'import-x/order': [
      'warn', {
        'alphabetize': { caseInsensitive: true, order: 'asc' },
        'newlines-between': 'never',
        'pathGroups': [
          { group: 'parent', pattern: '#src/**', position: 'before' },
          { group: 'parent', pattern: '#test/**', position: 'before' },
        ],
        'pathGroupsExcludedImportTypes': ['builtin'],
      },
    ],
  },
};

const plugin: PluginFactory = () => [importConfig];

export default plugin;
