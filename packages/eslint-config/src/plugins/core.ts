import type { Linter } from 'eslint';
import { scriptFiles } from '../files.ts';
import type { PluginFactory } from '../index.ts';

// --- Core ESLint rules not covered by presets ---

/** Core ESLint rules not covered by presets. */
const coreRuleConfig: Linter.Config = {
  files: [...scriptFiles],
  rules: {
    // Justification: Methods that don't use this should be static or extracted
    'class-methods-use-this': 'warn',
    // Justification: Penalize nested complexity, not flat dispatch
    'complexity': ['warn', { max: 10 }],
    // Justification: Single-letter namespace aliases are idiomatic for schema libraries
    'id-length': ['warn', { exceptions: ['v'] }],
    // Justification: Enforces modern JS idiom (x ??= y over x = x ?? y)
    'logical-assignment-operators': [
      'warn', 'always', { enforceForIfStatements: true },
    ],
    // Justification: Comments and blank lines are documentation, not complexity
    'max-lines': ['warn', { skipBlankLines: true, skipComments: true }],
    // Justification: 5+ params signals a missing options object
    'max-params': ['warn', { max: 4 }],
    // Justification: Pure functions; mutations belong at app boundaries
    'no-param-reassign': ['warn', { props: true }],
    // Justification: Use #src/* subpath imports instead of vitest @ aliases
    'no-restricted-imports': ['warn', {
      patterns: [{ group: ['@/*'], message: 'Use #src/* subpath imports instead of @/ aliases' }],
    }],
    // Justification: Prefer arrow functions for callbacks when `this` is unused
    'prefer-arrow-callback': ['warn', { allowNamedFunctions: true }],
    // Justification: Self-documenting regex capture groups
    'prefer-named-capture-group': 'warn',
    // Justification: Catches race conditions from async mutations in loops
    'require-atomic-updates': 'warn',
    // Justification: Declaration sort handled by import-x/order
    'sort-imports': ['warn', { ignoreDeclarationSort: true }],
    // Justification: Prevents BOM in source files
    'unicode-bom': 'warn',
  },
};

// --- Browser target ---

const browserConfigs = (
  entryPoints: readonly string[],
): Linter.Config[] => [
  {
    files: [...scriptFiles],
    rules: {
      // Justification: Browser code should use a logger, not console
      'no-alert': 'warn',
      'no-console': 'warn',
    },
  },
  {
    files: [...entryPoints],
    rules: {
      // Justification: Scripts and CLIs use console as their interface
      'no-console': 'off',
    },
  },
];

const plugin: PluginFactory = (options) => {
  const unicodeFlag = options.target === 'server' ? 'v' : 'u';

  return [
    coreRuleConfig,
    {
      files: [...scriptFiles],
      rules: {
        // Justification: Prevents subtle unicode bugs; /v for server, /u for browser compat
        'require-unicode-regexp': ['warn', { requireFlag: unicodeFlag }],
      },
    },
    ...(options.target === 'browser' ? browserConfigs(options.entryPoints) : []),
  ];
};

export default plugin;
