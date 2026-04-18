import json from '@eslint/json';
import type { Linter } from 'eslint';
import type { PluginFactory } from '../index.ts';

// --- JSON ---

const jsonRules: Linter.RulesRecord = {
  ...json.configs.recommended.rules,
  // Justification: Alphabetical keys reduce merge conflicts in shared JSON configs
  'json/sort-keys': 'warn',
};

/** JSON and JSONC linting configs. */
const plugin: PluginFactory = () => [
  {
    files: ['**/*.json'],
    ignores: ['**/package.json', '**/package-lock.json'],
    language: 'json/json',
    plugins: { json },
    rules: jsonRules,
  },
  {
    files: ['**/*.jsonc', '**/tsconfig.json', '**/tsconfig.*.json'],
    language: 'json/jsonc',
    plugins: { json },
    rules: jsonRules,
  },
];

export default plugin;
