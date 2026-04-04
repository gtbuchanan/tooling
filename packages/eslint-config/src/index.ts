import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import nodePlugin from 'eslint-plugin-n';
import oxlint from 'eslint-plugin-oxlint';
import { configs as pnpmPluginConfigs } from 'eslint-plugin-pnpm';
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

const resolvePnpmConfigs = (options: ESLintConfigureOptions) => {
  if (options.pnpm === false) {
    return [];
  }
  return [...pnpmPluginConfigs.json, ...pnpmPluginConfigs.yaml];
};

const resolveParserOptions = (options: ESLintConfigureOptions): Linter.ParserOptions => ({
  projectService: true,
  ...(options.tsconfigRootDir !== undefined && {
    tsconfigRootDir: options.tsconfigRootDir,
  }),
});

/**
 * Creates an ESLint flat config for TypeScript projects.
 * Supplementary to oxlint — covers `eslint-plugin-pnpm` and `eslint-plugin-n`.
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
    {
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
        'n/no-extraneous-import': 'off',
        // Justification: Redundant with oxlint native import plugin
        'n/no-missing-import': 'off',
        // Justification: Redundant with oxlint native import plugin
        'n/no-unpublished-import': 'off',
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
    { ignores },
    // Must be last — disables ESLint rules already covered by oxlint
    ...oxlint.configs['flat/all'],
  );
};
