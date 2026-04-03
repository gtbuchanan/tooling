import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import nodePlugin from 'eslint-plugin-n';
import oxlint from 'eslint-plugin-oxlint';
import { configs as pnpmPluginConfigs } from 'eslint-plugin-pnpm';
import tseslint from 'typescript-eslint';

export interface ESLintConfigureOptions {
  readonly tsconfigRootDir?: string;
  readonly ignores?: string[];
  readonly entryPoints?: string[];
  /**
   * Irreversible within a process — uses a side-effect import that
   * monkey-patches the ESLint Linter class.
   * @defaultValue true
   */
  readonly onlyWarn?: boolean;
  readonly pnpm?: boolean;
  /**
   * Applied before the global ignores and oxlint overlay. Consumer configs
   * that re-enable oxlint-covered rules will be silently overridden.
   */
  readonly extraConfigs?: Linter.Config[];
}

const resolvePnpmConfigs = (options: ESLintConfigureOptions) => {
  if (options.pnpm !== true) {
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

export const configure = async (options: ESLintConfigureOptions = {}): Promise<Linter.Config[]> => {
  const {
    entryPoints = ['**/bin/**/*.ts', '**/main.ts'],
    extraConfigs = [],
    ignores = ['**/dist/**'],
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
