import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { scriptFiles, tsOnlyFiles } from '../files.ts';
import type { PluginFactory, ResolvedOptions } from '../index.ts';

// --- TypeScript rule overrides (on top of strictTypeChecked + stylisticTypeChecked) ---

/** Rule overrides that apply to all script files (JS + TS). */
const scriptRuleOverrides: Linter.Config = {
  files: [...scriptFiles],
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

/** Rule overrides that require TypeScript syntax (export type, : ReturnType, import type). */
const tsOnlyRuleOverrides: Linter.Config = {
  files: [...tsOnlyFiles],
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
    // Justification: Prevents runtime imports for type-only specifiers
    '@typescript-eslint/no-import-type-side-effects': 'warn',
  },
};

/** Resolves TypeScript parser options from the shared config options. */
export const resolveParserOptions = (
  options: ResolvedOptions,
): Linter.ParserOptions => ({
  projectService: true,
  ...(options.tsconfigRootDir && {
    tsconfigRootDir: options.tsconfigRootDir,
  }),
});

const plugin: PluginFactory = options => [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  { languageOptions: { parserOptions: resolveParserOptions(options) } },
  scriptRuleOverrides,
  tsOnlyRuleOverrides,
  {
    files: ['**/*'],
    ignores: [...scriptFiles],
    ...tseslint.configs.disableTypeChecked,
  },
];

export default plugin;
