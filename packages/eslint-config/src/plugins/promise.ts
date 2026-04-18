import promisePlugin from 'eslint-plugin-promise';
import type { PluginFactory } from '../index.ts';

// --- Promise ---

/** Promise plugin recommended config with additional rules. */
const plugin: PluginFactory = () => [
  promisePlugin.configs['flat/recommended'],
  {
    rules: {
      // Justification: Catches resolving/rejecting a Promise more than once
      'promise/no-multiple-resolved': 'warn',
    },
  },
];

export default plugin;
