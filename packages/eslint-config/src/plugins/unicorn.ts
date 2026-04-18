import unicornPlugin from 'eslint-plugin-unicorn';
import type { PluginFactory } from '../index.ts';

// --- Unicorn ---

/** Unicorn recommended preset (scoped to TS) with rule overrides. */
const plugin: PluginFactory = () => [
  // Unicorn recommended (scoped to TS — unicorn crashes on JSON/YAML parsers)
  { ...unicornPlugin.configs.recommended, files: ['**/*.ts'] },
  {
    files: ['**/*.ts'],
    rules: {
      // Justification: Cannot distinguish intentional from accidental arity matches
      'unicorn/no-array-callback-reference': 'off',
      // Justification: reduce is a valid functional fold; banning it pushes toward mutable loops
      'unicorn/no-array-reduce': 'off',
      // TODO: Re-enable and configure allowlist in a separate PR
      'unicorn/prevent-abbreviations': 'off',
    },
  },
];

export default plugin;
