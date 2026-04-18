import eslintCommentsConfigs from '@eslint-community/eslint-plugin-eslint-comments/configs';
import type { PluginFactory } from '../index.ts';

// --- eslint-comments ---

/** ESLint comments plugin config requiring description suffixes. */
const plugin: PluginFactory = () => [
  eslintCommentsConfigs.recommended,
  {
    rules: {
      // Justification: Enforces the `--` reason suffix convention
      '@eslint-community/eslint-comments/require-description': [
        'warn', { ignore: ['eslint-enable'] },
      ],
    },
  },
];

export default plugin;
