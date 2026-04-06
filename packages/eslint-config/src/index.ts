import {
  eslintCommentsRuleOverrides,
  isAndroid,
  stylisticCustomizeDefaults,
  stylisticRuleOverrides,
} from '@gtbuchanan/oxlint-config';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import eslintCommentsConfigs from '@eslint-community/eslint-plugin-eslint-comments/configs';
import nodePlugin from 'eslint-plugin-n';
import oxlint from 'eslint-plugin-oxlint';
import { configs as pnpmPluginConfigs } from 'eslint-plugin-pnpm';
import stylistic from '@stylistic/eslint-plugin';
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
   * File patterns where `process.exit` and hashbang are allowed.
   * @defaultValue Bin directories and main entry points
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
}

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
  rules: {
    // Justification: Redundant with oxlint native import plugin
    'n/no-extraneous-import': 'off' as const,
    // Justification: Redundant with oxlint native import plugin
    'n/no-missing-import': 'off' as const,
    // Justification: Redundant with oxlint native import plugin
    'n/no-unpublished-import': 'off' as const,
  },
});

const resolveJsPluginFallbacks = (): Linter.Config[] =>
  isAndroid
    ? [
        { ...stylistic.configs.customize(stylisticCustomizeDefaults), files: ['**/*.ts'] },
        { files: ['**/*.ts'], rules: stylisticRuleOverrides },
        eslintCommentsConfigs.recommended,
        { rules: eslintCommentsRuleOverrides },
      ]
    : [];

/**
 * Creates an ESLint flat config for TypeScript projects.
 * Supplementary to oxlint — covers `eslint-plugin-pnpm` and `eslint-plugin-n`.
 * On Android, also runs `@stylistic/eslint-plugin` and
 * `@eslint-community/eslint-plugin-eslint-comments` as fallbacks for oxlint jsPlugins.
 * `eslint-plugin-oxlint` is applied last to disable overlapping rules.
 */
export const configure = async (options: ESLintConfigureOptions = {}): Promise<Linter.Config[]> => {
  const {
    entryPoints = ['**/bin/**/*.ts', '**/main.ts'],
    extraConfigs = [],
    ignores = ['.claude/worktrees/**', '**/dist/**'],
    onlyWarn = true,
  } = options;

  if (onlyWarn) {
    await import('eslint-plugin-only-warn');
  }

  return defineConfig(
    ...resolvePnpmConfigs(options),
    resolveNodeConfig(options),
    {
      // Core ESLint rules not implemented in oxlint
      files: ['**/*.ts'],
      rules: {
        // Justification: Enforces modern JS idiom (x ??= y over x = x ?? y)
        'logical-assignment-operators': [
          'warn', 'always', { enforceForIfStatements: true },
        ],
        // Justification: Prefer arrow functions for callbacks when `this` is unused
        'prefer-arrow-callback': [
          'warn', { allowNamedFunctions: true, allowUnboundThis: true },
        ],
        // Justification: Catches race conditions from async mutations in loops
        'require-atomic-updates': 'warn',
      },
    },
    {
      files: entryPoints,
      rules: {
        // Justification: Entry points use process.exit() for controlled shutdown
        'n/hashbang': 'off',
        // Justification: Entry points use process.exit() for controlled shutdown
        'n/no-process-exit': 'off',
      },
    },
    ...extraConfigs,
    ...resolveJsPluginFallbacks(),
    { ignores },
    // Must be last — disables ESLint rules already covered by oxlint
    ...oxlint.configs['flat/all'],
  );
};
