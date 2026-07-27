import json from '@eslint/json';
import type { Linter } from 'eslint';
import type { PluginFactory } from '../index.ts';

// --- JSON ---

/*
 * `json/sort-keys` is intentionally absent. Prettier already sorts JSON
 * keys here (prettier-plugin-sort-json with `jsonRecursiveSort`, see
 * format.ts), and a second *fixable* sorter corrupts the file: ESLint
 * sees the two rules' ranges as non-overlapping and applies both in one
 * pass, interleaving the reordered keys with a Prettier text diff that
 * was computed against the unsorted original. The result is invalid
 * JSON, which no later pass can recover. Do not re-enable it without
 * also dropping Prettier from these files.
 */
const jsonRules: Linter.RulesRecord = { ...json.configs.recommended.rules };

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
