import unicornPlugin from 'eslint-plugin-unicorn';
import { scriptFiles } from '../files.ts';
import type { PluginFactory } from '../index.ts';

// --- Unicorn ---

/** Unicorn recommended preset with rule overrides (scoped to script files). */
const plugin: PluginFactory = () => [
  { ...unicornPlugin.configs.recommended, files: [...scriptFiles] },
  {
    files: [...scriptFiles],
    rules: {
      // TODO: Re-enable and configure allowlist in a separate PR
      'unicorn/name-replacements': 'off',
      // Justification: Cannot distinguish intentional from accidental arity matches
      'unicorn/no-array-callback-reference': 'off',
      // Justification: reduce is a valid functional fold; banning it pushes toward mutable loops
      'unicorn/no-array-reduce': 'off',
      /* Justification: Flags Symbol.dispose/Symbol.asyncDispose, which are
         standard (Explicit Resource Management) but excluded from unicorn's
         ECMAScript baseline; the rule has no allowlist option to permit them */
      'unicorn/no-nonstandard-builtin-properties': 'off',
    },
  },
];

export default plugin;
