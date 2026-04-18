import { configs as ymlConfigs } from 'eslint-plugin-yml';
import type { PluginFactory } from '../index.ts';

// --- YAML ---

/** YAML linting configs with key sorting. */
const plugin: PluginFactory = () => [
  ...ymlConfigs['flat/recommended'],
  ...ymlConfigs['flat/prettier'],
  {
    files: ['**/*.yaml', '**/*.yml'],
    // Justification: Alphabetical keys reduce merge conflicts in shared YAML configs
    rules: { 'yml/sort-keys': 'warn' },
  },
];

export default plugin;
