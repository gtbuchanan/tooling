import { type DummyRuleMap, type OxlintConfig, type OxlintOverride, defineConfig } from 'oxlint';
import stylistic, { type StylisticCustomizeOptions } from '@stylistic/eslint-plugin';

/** Options for the shared oxlint configuration. */
export interface OxlintConfigureOptions {
  /**
   * Override category severities.
   * @defaultValue All 'warn' except nursery and restriction ('off')
   */
  readonly categories?: Partial<OxlintConfig['categories']>;
  /**
   * File patterns to ignore.
   * @defaultValue Claude Code worktrees and dist output directories
   */
  readonly ignorePatterns?: string[];
  /**
   * Oxlint options.
   * @defaultValue `{ denyWarnings: true, typeAware: true }`
   */
  readonly options?: Partial<OxlintConfig['options']>;
  /**
   * Additional rule overrides appended after the built-in vitest overrides.
   * @defaultValue []
   */
  readonly overrides?: OxlintOverride[];
  /**
   * `@stylistic/eslint-plugin` customization options.
   * @defaultValue `{ semi: true, severity: 'warn' }`
   */
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
  // Justification: Single-letter namespace aliases are idiomatic for schema libraries
  'id-length': ['warn', { exceptions: ['v'] }],
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
  // Justification: Namespace imports are idiomatic for schema libraries (e.g. valibot)
  'import/no-namespace': 'off',
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
  // Justification: Ternaries are readable for simple conditional assignments
  'no-ternary': 'off',
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

/**
 * Creates an oxlint configuration. Primary linter with all categories at
 * `warn` severity and `denyWarnings` for CI enforcement. Includes
 * `@stylistic/eslint-plugin` via jsPlugin for syntax-aware formatting.
 */
export const configure = (opts: OxlintConfigureOptions = {}): OxlintConfig => {
  const {
    categories: categoryOverrides,
    ignorePatterns = ['.claude/worktrees/**', '**/dist/**'],
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
        },
      },
      ...overrides,
    ],
    plugins: ['typescript', 'import', 'node'],
    rules: resolveRules(stylisticOptions),
  });
};
