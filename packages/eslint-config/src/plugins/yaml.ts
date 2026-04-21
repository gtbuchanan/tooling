import { configs as ymlConfigs } from 'eslint-plugin-yml';
import type { PluginFactory } from '../index.ts';

// --- YAML ---

/** YAML linting configs with key sorting and stricter value rules. */
const plugin: PluginFactory = () => [
  ...ymlConfigs['flat/recommended'],
  ...ymlConfigs['flat/prettier'],
  {
    files: ['**/*.yaml', '**/*.yml'],
    rules: {
      // Justification: Trailing zeros obscure numeric precision intent (e.g., 1.0 vs 1)
      'yml/no-trailing-zeros': 'warn',
      // Justification: Non-string keys (numbers, booleans) cause subtle type coercion bugs
      'yml/require-string-key': 'warn',
      // Justification: Alphabetical keys reduce merge conflicts in shared YAML configs
      'yml/sort-keys': 'warn',
    },
  },
];

export default plugin;
