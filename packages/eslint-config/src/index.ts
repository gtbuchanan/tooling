/// <reference path="./eslint-plugin-promise.d.ts" />
import json from '@eslint/json';
import eslintCommentsConfigs from '@eslint-community/eslint-plugin-eslint-comments/configs';
import stylistic from '@stylistic/eslint-plugin';
import vitestPlugin from '@vitest/eslint-plugin';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import-x';
import nodePlugin from 'eslint-plugin-n';
import { configs as pnpmPluginConfigs } from 'eslint-plugin-pnpm';
import promisePlugin from 'eslint-plugin-promise';
import unicornPlugin from 'eslint-plugin-unicorn';
import { configs as ymlConfigs } from 'eslint-plugin-yml';
import tseslint from 'typescript-eslint';

/** Default file patterns for entry points (bin and scripts directories). */
const defaultEntryPoints: readonly string[] = [
  '**/bin/**/*.ts',
  '**/scripts/**/*.ts',
];

/** Options for the shared ESLint configuration. */
export interface ESLintConfigureOptions {
  /** Root directory for TypeScript project service. */
  readonly tsconfigRootDir?: string;
  /**
   * Global ignore patterns.
   * @defaultValue Claude Code worktrees and dist output directories
   */
  readonly ignores?: string[];
  /**
   * File patterns for entry points exempt from `process.exit` and hashbang
   * restrictions. In browser mode, also exempt from `no-console`.
   * @defaultValue Bin directories and scripts directories
   */
  readonly entryPoints?: string[];
  /**
   * Irreversible within a process — uses a side-effect import that
   * monkey-patches the ESLint Linter class.
   * @defaultValue true
   */
  readonly onlyWarn?: boolean;
  /**
   * Enable eslint-plugin-pnpm rules for package.json and
   * pnpm-workspace.yaml files.
   * @defaultValue true
   */
  readonly pnpm?: boolean;
  /** Additional configs applied before the global ignores. */
  readonly extraConfigs?: Linter.Config[];
  /**
   * Target environment. Server targets enable require-unicode-regexp with
   * `/v` flag. Browser targets enable `no-console` and `no-alert`; entry
   * points are exempt from `no-console`.
   * @defaultValue 'server'
   */
  readonly target?: 'browser' | 'server';
}

// --- JSON ---

const jsonRules: Linter.RulesRecord = {
  ...json.configs.recommended.rules,
  // Justification: Alphabetical keys reduce merge conflicts in shared JSON configs
  'json/sort-keys': 'warn',
};

const jsonConfigs: Linter.Config[] = [
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

// --- YAML ---

const yamlConfigs: Linter.Config[] = [
  ...ymlConfigs['flat/recommended'],
  ...ymlConfigs['flat/prettier'],
  {
    files: ['**/*.yaml', '**/*.yml'],
    // Justification: Alphabetical keys reduce merge conflicts in shared YAML configs
    rules: { 'yml/sort-keys': 'warn' },
  },
];

// --- pnpm ---

const resolvePnpmConfigs = (options: ESLintConfigureOptions): Linter.Config[] => {
  if (options.pnpm === false) {
    return [];
  }
  return [...pnpmPluginConfigs.json, ...pnpmPluginConfigs.yaml];
};

// --- TypeScript parser ---

const resolveParserOptions = (options: ESLintConfigureOptions): Linter.ParserOptions => ({
  projectService: true,
  ...(options.tsconfigRootDir && {
    tsconfigRootDir: options.tsconfigRootDir,
  }),
});

type DefineConfigArg = Parameters<typeof defineConfig>[number];

// --- Node.js ---

const resolveNodeConfig = (options: ESLintConfigureOptions): DefineConfigArg => ({
  extends: [nodePlugin.configs['flat/recommended-module']],
  files: ['**/*.ts', '**/*.mts', '**/*.cts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: resolveParserOptions(options),
  },
  rules: {
    // Justification: Redundant with TypeScript module resolution
    'n/no-extraneous-import': 'off' as const,
    // Justification: Redundant with TypeScript module resolution
    'n/no-missing-import': 'off' as const,
    // Justification: Redundant with TypeScript module resolution
    'n/no-unpublished-import': 'off' as const,
  },
});

// --- Stylistic ---

const stylisticConfig: Linter.Config[] = [
  {
    ...stylistic.configs.customize({ braceStyle: '1tbs', semi: true, severity: 'warn' }),
    files: ['**/*.ts'],
  },
  {
    files: ['**/*.ts'],
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

// --- eslint-comments ---

const eslintCommentsConfig: Linter.Config[] = [
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

// --- import-x (ordering only) ---

const importConfig: Linter.Config = {
  files: ['**/*.ts'],
  plugins: { 'import-x': importPlugin },
  rules: {
    // Justification: Case-insensitive alphabetical grouping by import type
    'import-x/order': [
      'warn', {
        'alphabetize': { caseInsensitive: true, order: 'asc' },
        'newlines-between': 'never',
        'pathGroups': [
          { group: 'parent', pattern: '#src/**', position: 'before' },
          { group: 'parent', pattern: '#test/**', position: 'before' },
        ],
        'pathGroupsExcludedImportTypes': ['builtin'],
      },
    ],
  },
};

// --- Core ESLint rules not covered by presets ---

const coreRuleConfig: Linter.Config = {
  files: ['**/*.ts'],
  rules: {
    // Justification: Methods that don't use this should be static or extracted
    'class-methods-use-this': 'warn',
    // Justification: Penalize nested complexity, not flat dispatch
    'complexity': ['warn', { max: 10 }],
    // Justification: Single-letter namespace aliases are idiomatic for schema libraries
    'id-length': ['warn', { exceptions: ['v'] }],
    // Justification: Pushes toward const and expressions over statements
    'init-declarations': 'warn',
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
    'prefer-arrow-callback': [
      'warn', { allowNamedFunctions: true, allowUnboundThis: true },
    ],
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

// --- TypeScript rule overrides (on top of strictTypeChecked + stylisticTypeChecked) ---

const tsRuleOverrides: Linter.Config = {
  files: ['**/*.ts'],
  rules: {
    // Justification: Enforces export type for type-only re-exports
    '@typescript-eslint/consistent-type-exports': 'warn',
    // Justification: Stable return types; catches accidental API changes
    '@typescript-eslint/explicit-function-return-type': ['warn', {
      allowDirectConstAssertionInArrowFunctions: true,
      allowExpressions: true,
      allowHigherOrderFunctions: true,
      allowTypedFunctionExpressions: true,
    }],
    // Justification: Property syntax is contravariant (safe); method syntax is bivariant (unsafe)
    '@typescript-eslint/method-signature-style': 'warn',
    // Justification: Prevents snake_case drift from agents and API boundaries
    '@typescript-eslint/naming-convention': [
      'warn', {
        format: ['camelCase', 'PascalCase'],
        leadingUnderscore: 'allow',
        selector: 'variableLike',
        trailingUnderscore: 'allow',
      },
    ],
    // Justification: Prevents runtime imports for type-only specifiers
    '@typescript-eslint/no-import-type-side-effects': 'warn',
    // Justification: Common sentinel values that are universally understood
    '@typescript-eslint/no-magic-numbers': ['warn', {
      ignore: [-1, 0, 1, 100],
      ignoreDefaultValues: true,
      ignoreEnums: true,
      ignoreNumericLiteralTypes: true,
      ignoreTypeIndexes: true,
    }],
    // Justification: Rest siblings are the idiomatic way to omit properties
    '@typescript-eslint/no-unused-vars': ['warn', { ignoreRestSiblings: true }],
    // Justification: Allow constant loop conditions (e.g. while(true))
    '@typescript-eslint/no-unnecessary-condition': [
      'warn', { allowConstantLoopConditions: true },
    ],
    // Justification: Allows bitwise expressions in enum members
    '@typescript-eslint/prefer-literal-enum-member': [
      'warn', { allowBitwiseExpressions: true },
    ],
    // Justification: Falsy coalescing with || is idiomatic for strings and numbers
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
  },
};

// --- Promise ---

const promiseConfig: Linter.Config[] = [
  promisePlugin.configs['flat/recommended'],
  {
    rules: {
      // Justification: Catches resolving/rejecting a Promise more than once
      'promise/no-multiple-resolved': 'warn',
    },
  },
];

// --- Vitest ---

const testFiles = ['**/test/**/*.ts', '**/e2e/**/*.ts'];

const vitestConfigs: Linter.Config[] = [
  { ...vitestPlugin.configs.all, files: testFiles },
  {
    files: testFiles,
    rules: {
      // Justification: Tests often use arbitrary values
      '@typescript-eslint/no-magic-numbers': 'off',
      // Justification: Vitest import methods must use base import for typing
      '@typescript-eslint/consistent-type-imports': 'off',
      // Justification: Test helpers don't need return type documentation
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Justification: Rule not smart enough to detect assertions like expect().toBeDefined()
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Justification: Vitest-aware version allows vi.fn() mocks in expect()
      '@typescript-eslint/unbound-method': 'off',
      // Justification: Test organization results in 2 extra levels of nesting by default
      'max-nested-callbacks': ['warn', { max: 5 }],
      // Justification: Deprecated; lots of false positives
      'vitest/no-done-callback': 'off',
      // Justification: Not using globals; false positives for local expect
      // https://github.com/vitest-dev/eslint-plugin-vitest/issues/724
      'vitest/no-importing-vitest-globals': 'off',
      // Justification: Bug workaround
      // https://github.com/vitest-dev/eslint-plugin-vitest/issues/692
      'vitest/prefer-describe-function-title': 'off',
      // Justification: Globally defined in setupFiles via expect.hasAssertions()
      'vitest/prefer-expect-assertions': 'off',
      // Justification: Conflicts with no-importing-vitest-globals
      // https://github.com/vitest-dev/eslint-plugin-vitest/issues/724
      'vitest/prefer-importing-vitest-globals': 'off',
      // Justification: Top-level describe may refer to title-case type name
      'vitest/prefer-lowercase-title': ['warn', { ignoreTopLevelDescribe: true }],
      // Justification: Various hook-like function calls are false positives
      'vitest/require-hook': ['warn', { allowedFunctionCalls: ['it.for', 'test.for'] }],
      // Justification: Not all tests need explicit timeouts
      'vitest/require-test-timeout': 'off',
      // Justification: Top-level it() is valid in vitest
      'vitest/require-top-level-describe': 'off',
      // Justification: Allow variable references in test titles
      'vitest/valid-title': ['warn', { allowArguments: true }],
    },
  },
  {
    files: ['**/e2e/**/*.ts'],
    rules: {
      // Justification: E2e tests need beforeAll/afterAll for fixture setup/teardown
      'vitest/no-hooks': 'off',
    },
  },
];

// --- Browser target ---

const resolveBrowserConfigs = (
  entryPoints: readonly string[],
): Linter.Config[] => [
  {
    files: ['**/*.ts'],
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

/**
 * Creates an ESLint flat config for TypeScript projects.
 * Primary linter with `typescript-eslint` strictTypeChecked +
 * stylisticTypeChecked, `eslint-plugin-unicorn`, `eslint-plugin-promise`,
 * `@stylistic/eslint-plugin`, `@eslint-community/eslint-plugin-eslint-comments`,
 * `eslint-plugin-import-x`, `eslint-plugin-n`, `@vitest/eslint-plugin`,
 * `@eslint/json`, `eslint-plugin-yml`, and `eslint-plugin-pnpm`.
 */
export const configure = async (
  options: ESLintConfigureOptions = {},
): Promise<Linter.Config[]> => {
  const {
    entryPoints = [...defaultEntryPoints],
    extraConfigs = [],
    ignores = ['.claude/worktrees/**', '**/dist/**', '**/pnpm-lock.yaml'],
    onlyWarn = true,
    target = 'server',
  } = options;

  if (onlyWarn) {
    await import('eslint-plugin-only-warn');
  }

  const unicodeFlag = target === 'server' ? 'v' : 'u';

  return defineConfig(
    // TypeScript presets (strict + stylistic, type-checked)
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    { languageOptions: { parserOptions: resolveParserOptions(options) } },
    // Unicorn recommended (scoped to TS — unicorn crashes on JSON/YAML parsers)
    { ...unicornPlugin.configs['flat/recommended'], files: ['**/*.ts'] },
    {
      files: ['**/*.ts'],
      rules: {
        // TODO: Re-enable and configure allowlist in a separate PR
        'unicorn/prevent-abbreviations': 'off',
      },
    },
    // Promise recommended + manual rules
    ...promiseConfig,
    // JSON
    ...jsonConfigs,
    // YAML
    ...yamlConfigs,
    // pnpm
    ...resolvePnpmConfigs(options),
    // Node.js
    resolveNodeConfig(options),
    // Stylistic
    ...stylisticConfig,
    // eslint-comments
    ...eslintCommentsConfig,
    // import-x ordering
    importConfig,
    // Core ESLint rules not covered by presets
    coreRuleConfig,
    // TypeScript rule overrides
    tsRuleOverrides,
    // Target-specific rules
    {
      files: ['**/*.ts'],
      rules: {
        // Justification: Prevents subtle unicode bugs; /v for server, /u for browser compat
        'require-unicode-regexp': ['warn', { requireFlag: unicodeFlag }],
      },
    },
    ...(target === 'browser' ? resolveBrowserConfigs(entryPoints) : []),
    // Entry point overrides
    {
      files: [...entryPoints],
      rules: {
        // Justification: Entry points use process.exit() for controlled shutdown
        'n/hashbang': 'off',
        // Justification: Entry points use process.exit() for controlled shutdown
        'n/no-process-exit': 'off',
      },
    },
    // Vitest
    ...vitestConfigs,
    // Consumer extra configs
    ...extraConfigs,
    // Disable type-checked rules for non-TS files (JSON, YAML, etc.)
    {
      files: ['**/*.json', '**/*.jsonc', '**/*.yaml', '**/*.yml'],
      ...tseslint.configs.disableTypeChecked,
    },
    // Global ignores
    { ignores },
  );
};
