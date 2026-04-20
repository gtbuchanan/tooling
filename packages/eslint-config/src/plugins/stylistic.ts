import stylistic from '@stylistic/eslint-plugin';
import { scriptFiles } from '../files.ts';
import type { PluginFactory } from '../index.ts';

// --- Stylistic ---

/** Stylistic formatting rules for script files. */
const plugin: PluginFactory = () => [
  {
    ...stylistic.configs.customize({ braceStyle: '1tbs', semi: true, severity: 'warn' }),
    files: [...scriptFiles],
  },
  {
    files: [...scriptFiles],
    rules: {
      /*
       * Justification: 100 is a compromise between full-screen monitors and
       * narrower splits; ignoreUrls avoids forcing URL line breaks.
       */
      '@stylistic/max-len': ['warn', { code: 100, ignoreUrls: true }],
      // Justification: Not included by customize(); catches accidental double semicolons
      '@stylistic/no-extra-semi': 'warn',
      // Justification: Matches C# style; ternary/union/intersection before, rest after
      '@stylistic/operator-linebreak': [
        'warn', 'after',
        { overrides: { '&': 'before', ':': 'before', '?': 'before', '|': 'before' } },
      ],
      // Justification: Prefer escape-free strings; avoid unnecessary template literals
      '@stylistic/quotes': [
        'warn', 'single',
        { allowTemplateLiterals: 'avoidEscape', avoidEscape: true },
      ],
    },
  },
];

export default plugin;
