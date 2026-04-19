import regexpPlugin from 'eslint-plugin-regexp';
import type { PluginFactory } from '../index.ts';

// --- Regexp ---

/** Regexp recommended config for catching unsafe and inefficient patterns. */
const plugin: PluginFactory = () => [
  {
    ...regexpPlugin.configs['flat/recommended'],
    files: ['**/*.ts'],
  },
];

export default plugin;
