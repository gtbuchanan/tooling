import json from '@eslint/json';
import eslintCommentsConfigs from '@eslint-community/eslint-plugin-eslint-comments/configs';
import {
  defaultEntryPoints,
  eslintCommentsRuleOverrides,
  importOrderRules,
  jsPluginsSupported,
  stylisticCustomizeDefaults,
  stylisticRuleOverrides,
  vitestE2eRuleOverrides,
  vitestRuleOverrides,
} from '@gtbuchanan/oxlint-config';
import stylistic from '@stylistic/eslint-plugin';
import vitestPlugin from '@vitest/eslint-plugin';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import-x';
import nodePlugin from 'eslint-plugin-n';
import oxlint from 'eslint-plugin-oxlint';
// oxlint-disable-next-line import/max-dependencies -- Config aggregator
import { configs as pnpmPluginConfigs } from 'eslint-plugin-pnpm';
import { configs as ymlConfigs } from 'eslint-plugin-yml';
import tseslint from 'typescript-eslint';

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
   * restrictions.
   * @defaultValue {@link defaultEntryPoints}
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
  /**
   * Applied before the global ignores and oxlint overlay. Consumer configs
   * that re-enable oxlint-covered rules will be silently overridden.
   */
  readonly extraConfigs?: Linter.Config[];
  /**
   * Target environment. Matches oxlint-config's target option.
   * Server targets enable require-unicode-regexp with `/v` flag.
   * @defaultValue 'server'
   */
  readonly target?: 'browser' | 'server';
}

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

const yamlConfigs: Linter.Config[] = [
  ...ymlConfigs['flat/recommended'],
  ...ymlConfigs['flat/prettier'],
  {
    files: ['**/*.yaml', '**/*.yml'],
    // Justification: Alphabetical keys reduce merge conflicts in shared YAML configs
    rules: { 'yml/sort-keys': 'warn' },
  },
];

const resolvePnpmConfigs = (options: ESLintConfigureOptions): Linter.Config[] => {
  if (options.pnpm === false) {
    return [];
  }
  return [...pnpmPluginConfigs.json, ...pnpmPluginConfigs.yaml];
};

const resolveParserOptions = (options: ESLintConfigureOptions): Linter.ParserOptions => ({
  projectService: true,
  ...(options.tsconfigRootDir && {
    tsconfigRootDir: options.tsconfigRootDir,
  }),
});

type DefineConfigArg = Parameters<typeof defineConfig>[number];

const resolveNodeConfig = (options: ESLintConfigureOptions): DefineConfigArg => ({
  /*
   * HACK: eslint-plugin-n belongs in oxlint-config as a jsPlugin, but
   * oxlint jsPlugins don't support type-awareness yet. Move it there
   * when oxlint jsPlugins exit alpha.
   */
  extends: [nodePlugin.configs['flat/recommended-module']],
  files: ['**/*.ts', '**/*.mts', '**/*.cts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: resolveParserOptions(options),
  },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
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
    // Justification: Redundant with oxlint native import plugin
    'n/no-extraneous-import': 'off' as const,
    // Justification: Redundant with oxlint native import plugin
    'n/no-missing-import': 'off' as const,
    // Justification: Redundant with oxlint native import plugin
    'n/no-unpublished-import': 'off' as const,
  },
});

const resolveJsPluginFallbacks = (): Linter.Config[] =>
  jsPluginsSupported
    ? []
    : [
        { ...stylistic.configs.customize(stylisticCustomizeDefaults), files: ['**/*.ts'] },
        { files: ['**/*.ts'], rules: stylisticRuleOverrides },
        eslintCommentsConfigs.recommended,
        { rules: eslintCommentsRuleOverrides },
        {
          files: ['**/*.ts'],
          plugins: { 'import-x': importPlugin },
          rules: importOrderRules,
        },
      ];

const testFiles = ['**/test/**/*.ts', '**/e2e/**/*.ts'];

// Core ESLint rules not implemented in oxlint
const coreRuleConfig: Linter.Config = {
  files: ['**/*.ts'],
  rules: {
    // Justification: Pushes toward const and expressions over statements
    'init-declarations': 'warn',
    // Justification: Enforces modern JS idiom (x ??= y over x = x ?? y)
    'logical-assignment-operators': [
      'warn', 'always', { enforceForIfStatements: true },
    ],
    // Justification: Prefer arrow functions for callbacks when `this` is unused
    'prefer-arrow-callback': [
      'warn', { allowNamedFunctions: true, allowUnboundThis: true },
    ],
    // Justification: Self-documenting regex capture groups
    'prefer-named-capture-group': 'warn',
    // Justification: Catches race conditions from async mutations in loops
    'require-atomic-updates': 'warn',
  },
};

const vitestConfigs: Linter.Config[] = [
  { ...vitestPlugin.configs.all, files: testFiles },
  { files: testFiles, rules: vitestRuleOverrides },
  { files: ['**/e2e/**/*.ts'], rules: vitestE2eRuleOverrides },
];

/**
 * Creates an ESLint flat config for TypeScript projects.
 * Supplementary to oxlint — covers `@eslint/json`, `eslint-plugin-pnpm`,
 * `eslint-plugin-n`, and `@vitest/eslint-plugin`. On platforms where oxlint
 * jsPlugins are unsupported (Windows, Android), also runs
 * `@stylistic/eslint-plugin`, `@eslint-community/eslint-plugin-eslint-comments`,
 * and `eslint-plugin-import-x` as fallbacks.
 * `eslint-plugin-oxlint` is applied last to disable overlapping rules.
 */
export const configure = async (options: ESLintConfigureOptions = {}): Promise<Linter.Config[]> => {
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

  const targetRules: Linter.Config = {
    files: ['**/*.ts'],
    rules: {
      // Justification: Prevents subtle unicode bugs; /v for server, /u for browser compat
      'require-unicode-regexp': ['warn', { requireFlag: unicodeFlag }],
    },
  };

  return defineConfig(
    ...jsonConfigs,
    ...yamlConfigs,
    ...resolvePnpmConfigs(options),
    resolveNodeConfig(options),
    coreRuleConfig,
    targetRules,
    {
      files: entryPoints,
      rules: {
        // Justification: Entry points use process.exit() for controlled shutdown
        'n/hashbang': 'off',
        // Justification: Entry points use process.exit() for controlled shutdown
        'n/no-process-exit': 'off',
      },
    },
    ...vitestConfigs,
    ...extraConfigs,
    ...resolveJsPluginFallbacks(),
    { ignores },
    // Must be last — disables ESLint rules already covered by oxlint
    ...oxlint.configs['flat/all'],
  );
};
