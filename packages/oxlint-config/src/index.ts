import { type DummyRuleMap, type OxlintConfig, type OxlintOverride, defineConfig } from 'oxlint';
import stylistic, { type StylisticCustomizeOptions } from '@stylistic/eslint-plugin';

export interface OxlintConfigureOptions {
  readonly categories?: Partial<OxlintConfig['categories']>;
  readonly ignorePatterns?: string[];
  readonly options?: Partial<OxlintConfig['options']>;
  readonly overrides?: OxlintOverride[];
  readonly stylistic?: StylisticCustomizeOptions;
}

const resolveStylisticRules = (opts?: StylisticCustomizeOptions): DummyRuleMap => {
  const rules: DummyRuleMap = {};
  for (const [key, value] of Object.entries(stylistic.configs.customize({
    semi: true,
    severity: 'warn',
    ...opts,
  }).rules ?? {})) {
    if (value !== undefined) {
      rules[key] = value;
    }
  }
  return rules;
};

const MAX_LINE_LENGTH = 100;

const ruleOverrides: DummyRuleMap = {
  /*
   * Justification: Both options conflict with other rules or emit unnecessary
   * runtime code. prefer-top-level conflicts with no-duplicate-imports for mixed
   * value+type imports (https://github.com/oxc-project/oxc/issues/11660).
   * prefer-inline emits empty runtime imports for type-only imports. Superseded
   * by typescript/consistent-type-imports from the style category.
   */
  'import/consistent-type-specifier-style': 'off',
  // Justification: TS interfaces and types must be exported at declaration site
  'import/exports-last': 'off',
  // Justification: Inline export on each declaration is idiomatic TypeScript
  'import/group-exports': 'off',
  // Justification: Named exports are the standard pattern for libraries
  'import/no-named-export': 'off',
  // Justification: Named exports are the standard pattern for libraries
  'import/prefer-default-export': 'off',
  // Justification: continue is idiomatic for early guard clauses in loops
  'no-continue': 'off',
  // Justification: Common sentinel values that are universally understood
  'no-magic-numbers': ['warn', {
    ignore: [-1, 0, 1, 100],
    ignoreDefaultValues: true,
    ignoreEnums: true,
    ignoreNumericLiteralTypes: true,
    ignoreTypeIndexes: true,
  }],
};

const resolveRules = (stylisticOptions?: StylisticCustomizeOptions): DummyRuleMap => ({
  ...resolveStylisticRules(stylisticOptions),
  /*
   * Justification: 80 is the historical recommendation due to punch cards but also
   * has some basis in "reading ergonomics" (e.g. typography). 100 is chosen as a
   * compromise between those coding full screen on larger monitors and those that aren't.
   */
  '@stylistic/max-len': ['warn', { code: MAX_LINE_LENGTH, ignoreUrls: true }],
  // Justification: Not included by customize(); needed to catch accidental double semicolons
  '@stylistic/no-extra-semi': 'warn',
  // Justification: Matches C# style; ternary/union/intersection before, rest after
  '@stylistic/operator-linebreak': [
    'warn',
    'after',
    {
      overrides: {
        '&': 'before',
        ':': 'before',
        '?': 'before',
        '|': 'before',
      },
    },
  ],
  // Justification: Prefer escape-free strings; avoid unnecessary template literals
  '@stylistic/quotes': [
    'warn',
    'single',
    { allowTemplateLiterals: 'avoidEscape', avoidEscape: true },
  ],
  ...ruleOverrides,
});

export const configure = (opts: OxlintConfigureOptions = {}): OxlintConfig => {
  const {
    categories: categoryOverrides,
    ignorePatterns = ['**/dist/**'],
    options: optionOverrides,
    overrides = [],
    stylistic: stylisticOptions,
  } = opts;

  return defineConfig({
    categories: {
      correctness: 'warn',
      nursery: 'off',
      pedantic: 'warn',
      perf: 'warn',
      restriction: 'off',
      style: 'warn',
      suspicious: 'warn',
      ...categoryOverrides,
    },
    ignorePatterns,
    jsPlugins: ['@stylistic/eslint-plugin'],
    options: { denyWarnings: true, typeAware: true, ...optionOverrides },
    overrides: [
      {
        files: ['**/test/**/*.ts', '**/e2e/**/*.ts'],
        plugins: ['vitest'],
        rules: {
          // Justification: Test describe blocks naturally exceed this limit
          'max-lines-per-function': 'off',
          // Justification: Test describe blocks naturally have many statements
          'max-statements': 'off',
          // Justification: Tests often use arbitrary values that shouldn't need to be constants
          'no-magic-numbers': 'off',
          // Justification: Vitest-aware version allows vi.fn() mocks in expect()
          'typescript/unbound-method': 'off',
          // Justification: Not using globals; false positives for local expect
          // https://github.com/vitest-dev/eslint-plugin-vitest/issues/724
          'vitest/no-importing-vitest-globals': 'off',
          // Justification: Bug with false positives
          // https://github.com/vitest-dev/eslint-plugin-vitest/issues/692
          'vitest/prefer-describe-function-title': 'off',
        },
      },
      ...overrides,
    ],
    plugins: ['typescript', 'import', 'node'],
    rules: resolveRules(stylisticOptions),
  });
};
