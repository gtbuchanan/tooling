import { fileURLToPath } from 'node:url';
import stylistic, { type StylisticCustomizeOptions } from '@stylistic/eslint-plugin';
import {
  type DummyRule,
  type DummyRuleMap,
  type ExternalPluginEntry,
  type OxlintConfig,
  type OxlintOverride,
  defineConfig,
} from 'oxlint';
import { jsPluginsSupported } from './platform.ts';

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
   * File patterns for entry points exempt from browser-only restrictions
   * (e.g. `import/no-nodejs-modules`, `no-console`).
   * @defaultValue Bin directories, scripts directories, and main entry points
   */
  readonly entryPoints?: string[];
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
  /**
   * Target environment. Server targets disable `import/no-nodejs-modules`.
   * Browser targets enable `no-console` and `no-alert`; entry points are
   * exempt from both `no-console` and `import/no-nodejs-modules`.
   * @defaultValue 'server'
   */
  readonly target?: 'browser' | 'server';
}

const resolveStylisticRules = (opts?: StylisticCustomizeOptions): DummyRuleMap => {
  const rules: DummyRuleMap = {};
  for (const [key, value] of Object.entries(
    stylistic.configs.customize({ ...stylisticCustomizeDefaults, ...opts }).rules ?? {},
  )) {
    if (value) {
      rules[key] = value;
    }
  }
  return rules;
};

const maxLineLength = 100;

/*
 * Rules not implemented in oxlint — enabled in ESLint (see eslint-config):
 * - init-declarations, method-signature-style, naming-convention,
 *   prefer-named-capture-group, require-unicode-regexp
 *
 * Rules deliberately skipped:
 * - consistent-this: Redundant with no-this-alias (style category)
 * - explicit-module-boundary-types: Redundant with explicit-function-return-type
 * - no-plusplus: Banning all uses is disproportionate for rare ambiguity
 * - no-void: void operator is the standard fire-and-forget pattern
 * - promise-function-async: Conflicts with overloads, adds microtasks
 */
const ruleOverrides: DummyRuleMap = {
  // Justification: Methods that don't use this should be static or extracted
  'class-methods-use-this': 'warn',
  // Justification: Penalize nested complexity, not flat dispatch (e.g. switch/case)
  'complexity': ['warn', { max: 10, variant: 'modified' }],
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
  // Justification: Comments and blank lines are documentation, not complexity
  'max-lines': ['warn', { skipBlankLines: true, skipComments: true }],
  // Justification: 5+ params signals a missing options object
  'max-params': ['warn', { max: 4 }],
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
  // Justification: Pure functions; mutations belong at app boundaries
  'no-param-reassign': ['warn', { props: true }],
  // Justification: Use #src/* subpath imports instead of vitest @ aliases
  'no-restricted-imports': ['warn', {
    patterns: [{ group: ['@/*'], message: 'Use #src/* subpath imports instead of @/ aliases' }],
  }],
  // Justification: Ternaries are readable for simple conditional assignments
  'no-ternary': 'off',
  // Justification: Catches resolving/rejecting a Promise more than once
  'promise/no-multiple-resolved': 'warn',
  // Justification: Catches wrapping resolved values in Promise.resolve()
  'promise/no-return-wrap': 'warn',
  // Justification: Enforces standard resolve/reject parameter names
  'promise/param-names': 'warn',
  // Justification: Declaration sort handled by import-x-js/order via jsPlugin
  'sort-imports': ['warn', { ignoreDeclarationSort: true }],
  // Justification: Enforces export type for type-only re-exports
  'typescript/consistent-type-exports': 'warn',
  // Justification: Stable return types in .d.ts; catches accidental API changes
  'typescript/explicit-function-return-type': ['warn', {
    allowDirectConstAssertionInArrowFunctions: true,
    allowExpressions: true,
    allowHigherOrderFunctions: true,
    allowTypedFunctionExpressions: true,
  }],
  // Justification: Use Map/Set instead of dynamic delete on objects
  'typescript/no-dynamic-delete': 'warn',
  // Justification: Forces unknown + narrowing over any
  'typescript/no-explicit-any': 'warn',
  // Justification: Prevents runtime imports for type-only specifiers
  'typescript/no-import-type-side-effects': 'warn',
  // Justification: Prevents void outside return types and generics
  'typescript/no-invalid-void-type': 'warn',
  // Justification: Modern TS uses ES modules; namespaces are legacy
  'typescript/no-namespace': 'warn',
  // Justification: Catches always-true/false conditions after type narrowing
  'typescript/no-unnecessary-condition': ['warn', { allowConstantLoopConditions: true }],
  // Justification: Catches generic params that don't add type safety
  'typescript/no-unnecessary-type-parameters': 'warn',
  // Justification: Prefers x! over x as T when only nullability differs
  'typescript/non-nullable-type-assertion-style': 'warn',
  // Justification: Prevents computed enum values for predictability
  'typescript/prefer-literal-enum-member': ['warn', { allowBitwiseExpressions: true }],
  // Justification: Falsy coalescing with || is idiomatic for strings and numbers
  'typescript/prefer-nullish-coalescing': 'off',
  // Justification: Enforces a?.b over a && a.b
  'typescript/prefer-optional-chain': 'warn',
  // Justification: Explicit nullish checks are often clearer than optional chaining
  'typescript/strict-boolean-expressions': 'off',
  // Justification: Catches returning values in void-typed callbacks
  'typescript/strict-void-return': 'warn',
  // Justification: Enforces unknown over any in .catch() callbacks
  'typescript/use-unknown-in-catch-callback-variable': 'warn',
  // Justification: Prevents BOM in source files
  'unicode-bom': 'warn',
};

// Justification: Catches stale, mismatched, and undocumented ESLint disable comments
const eslintCommentsRecommendedRules: DummyRuleMap = {
  '@eslint-community/eslint-comments/disable-enable-pair': 'warn',
  '@eslint-community/eslint-comments/no-aggregating-enable': 'warn',
  '@eslint-community/eslint-comments/no-duplicate-disable': 'warn',
  '@eslint-community/eslint-comments/no-unlimited-disable': 'warn',
  '@eslint-community/eslint-comments/no-unused-enable': 'warn',
};

export { jsPluginsSupported } from './platform.ts';

/** Default file patterns for entry points (bin and scripts directories). */
export const defaultEntryPoints: readonly string[] = [
  '**/bin/**/*.ts',
  '**/scripts/**/*.ts',
];

/** Default stylistic customize options for `@stylistic/eslint-plugin`. */
export const stylisticCustomizeDefaults: StylisticCustomizeOptions = {
  braceStyle: '1tbs',
  semi: true,
  severity: 'warn',
};

const importOrderOptions = {
  'alphabetize': { caseInsensitive: true, order: 'asc' as const },
  'newlines-between': 'never' as const,
  'pathGroups': [
    { group: 'parent' as const, pattern: '#src/**', position: 'before' as const },
    { group: 'parent' as const, pattern: '#test/**', position: 'before' as const },
  ],
  'pathGroupsExcludedImportTypes': ['builtin' as const],
};

// Oxlint reserves 'import-x' for its native import plugin; alias avoids conflict
const importXAlias = 'import-x-js';

const importOrderRulesOxlint: DummyRuleMap = {
  [`${importXAlias}/order`]: ['warn', importOrderOptions],
};

/**
 * Import ordering rules for ESLint fallback (uses real plugin name).
 * Use with ESLint as a fallback when oxlint jsPlugins are unavailable.
 */
export const importOrderRules = {
  // Justification: Case-insensitive alphabetical grouping by import type
  'import-x/order': [
    'warn' as const, importOrderOptions,
  ] satisfies DummyRule,
};

/**
 * Eslint-comments rule overrides applied on top of recommended defaults.
 * Use with ESLint as a fallback when oxlint jsPlugins are unavailable.
 */
export const eslintCommentsRuleOverrides = {
  // Justification: Enforces the `--` reason suffix convention for inline suppressions
  '@eslint-community/eslint-comments/require-description': [
    'warn' as const, { ignore: ['eslint-enable'] },
  ] satisfies DummyRule,
};

/**
 * Stylistic rule overrides applied on top of `customize()` defaults.
 * Use with ESLint as a fallback when oxlint jsPlugins are unavailable.
 */
export const stylisticRuleOverrides = {
  /*
   * Justification: 80 is the historical recommendation due to punch cards but also
   * has some basis in "reading ergonomics" (e.g. typography). 100 is chosen as a
   * compromise between those coding full screen on larger monitors and those that aren't.
   */
  '@stylistic/max-len': [
    'warn' as const, { code: maxLineLength, ignoreUrls: true },
  ] satisfies DummyRule,
  // Justification: Not included by customize(); needed to catch accidental double semicolons
  '@stylistic/no-extra-semi': 'warn' as const,
  // Justification: Matches C# style; ternary/union/intersection before, rest after
  '@stylistic/operator-linebreak': [
    'warn' as const, 'after',
    { overrides: { '&': 'before', ':': 'before', '?': 'before', '|': 'before' } },
  ] satisfies DummyRule,
  // Justification: Prefer escape-free strings; avoid unnecessary template literals
  '@stylistic/quotes': [
    'warn' as const, 'single',
    { allowTemplateLiterals: 'avoidEscape', avoidEscape: true },
  ] satisfies DummyRule,
};

/** Resolves a package specifier to an absolute path for oxlint jsPlugins. */
const resolveJsPlugin = (specifier: string): string =>
  fileURLToPath(import.meta.resolve(specifier));

const resolveJsPlugins = (): ExternalPluginEntry[] => [
  resolveJsPlugin('@stylistic/eslint-plugin'),
  resolveJsPlugin('@eslint-community/eslint-plugin-eslint-comments'),
  {
    name: importXAlias,
    specifier: resolveJsPlugin('eslint-plugin-import-x'),
  },
];

const testOverride: OxlintOverride = {
  files: ['**/test/**/*.ts', '**/e2e/**/*.ts'],
  plugins: ['vitest'],
  rules: {
    // Justification: Test describe blocks naturally exceed this limit
    'max-lines-per-function': 'off',
    // Justification: Test describe blocks naturally have many statements
    'max-statements': 'off',
    // Justification: Tests often use arbitrary values that shouldn't need to be constants
    'no-magic-numbers': 'off',
    // Justification: Test helpers don't need return type documentation
    'typescript/explicit-function-return-type': 'off',
    // Justification: Vitest-aware version allows vi.fn() mocks in expect()
    'typescript/unbound-method': 'off',
    // Justification: Enable all oxlint-native vitest rules for test quality and consistency
    'vitest/consistent-each-for': 'warn',
    'vitest/consistent-test-filename': 'warn',
    'vitest/consistent-vitest-vi': 'warn',
    'vitest/hoisted-apis-on-top': 'warn',
    'vitest/no-conditional-tests': 'warn',
    'vitest/no-import-node-test': 'warn',
    // Justification: Not using globals; false positives for local expect
    // https://github.com/vitest-dev/eslint-plugin-vitest/issues/724
    'vitest/no-importing-vitest-globals': 'off',
    'vitest/prefer-called-exactly-once-with': 'warn',
    'vitest/prefer-called-once': 'warn',
    'vitest/prefer-called-times': 'warn',
    'vitest/prefer-describe-function-title': 'warn',
    'vitest/prefer-expect-type-of': 'warn',
    'vitest/prefer-import-in-mock': 'warn',
    'vitest/prefer-strict-boolean-matchers': 'warn',
    'vitest/prefer-to-be-falsy': 'warn',
    'vitest/prefer-to-be-object': 'warn',
    'vitest/prefer-to-be-truthy': 'warn',
    'vitest/require-awaited-expect-poll': 'warn',
    'vitest/require-local-test-context-for-concurrent-snapshots': 'warn',
    'vitest/require-mock-type-parameters': 'warn',
    // Justification: Not all tests need explicit timeouts
    'vitest/require-test-timeout': 'off',
    'vitest/warn-todo': 'warn',
  },
};

/**
 * Vitest ESLint rules to disable from the `all` config.
 * Applied after `@vitest/eslint-plugin`'s `all` config in ESLint.
 */
export const vitestRuleOverrides = {
  // Justification: Not using globals; false positives for local expect
  // https://github.com/vitest-dev/eslint-plugin-vitest/issues/724
  'vitest/no-importing-vitest-globals': 'off' as const,
  // Justification: Requiring expect.assertions(n) in every test is noisy
  'vitest/prefer-expect-assertions': 'off' as const,
  // Justification: Conflicts with no-importing-vitest-globals
  'vitest/prefer-importing-vitest-globals': 'off' as const,
  // Justification: Not all tests need explicit timeouts
  'vitest/require-test-timeout': 'off' as const,
  // Justification: Top-level it() is valid in vitest
  'vitest/require-top-level-describe': 'off' as const,
};

/**
 * Vitest ESLint rules to disable for e2e tests.
 * E2e tests legitimately need hooks for fixture lifecycle.
 */
export const vitestE2eRuleOverrides = {
  // Justification: E2e tests need beforeAll/afterAll for fixture setup/teardown
  'vitest/no-hooks': 'off' as const,
};

const resolveRules = (stylisticOptions?: StylisticCustomizeOptions): DummyRuleMap => ({
  ...resolveStylisticRules(stylisticOptions),
  ...stylisticRuleOverrides,
  ...eslintCommentsRecommendedRules,
  ...eslintCommentsRuleOverrides,
  ...importOrderRulesOxlint,
  ...ruleOverrides,
});

const browserOverride: OxlintOverride = {
  files: ['**/*.ts'],
  rules: {
    // Justification: Browser code should use a logger, not console
    'no-alert': 'warn',
    'no-console': 'warn',
  },
};

const serverOverride: OxlintOverride = {
  files: ['**/*.ts'],
  rules: {
    // Justification: Server code uses Node.js built-in modules
    'import/no-nodejs-modules': 'off',
  },
};

/**
 * Creates an oxlint configuration. Primary linter with all categories at
 * `warn` severity and `denyWarnings` for CI enforcement. Includes
 * `@stylistic/eslint-plugin` and `@eslint-community/eslint-plugin-eslint-comments`
 * via jsPlugins.
 */
export const configure = (opts: OxlintConfigureOptions = {}): OxlintConfig => {
  const {
    categories: categoryOverrides,
    entryPoints = [...defaultEntryPoints],
    ignorePatterns = ['.claude/worktrees/**', '**/dist/**'],
    options: optionOverrides,
    overrides = [],
    stylistic: stylisticOptions,
    target = 'server',
  } = opts;

  const browserEntryPointExemption: OxlintOverride = {
    files: entryPoints,
    rules: {
      // Justification: Entry points and scripts are Node.js by nature
      'import/no-nodejs-modules': 'off',
      // Justification: Scripts and CLIs use console as their interface
      'no-console': 'off',
    },
  };

  const targetOverrides = target === 'browser'
    ? [browserOverride, browserEntryPointExemption]
    : [serverOverride];

  return defineConfig({
    categories: {
      correctness: 'warn',
      // Justification: Nursery rules are unstable; restriction rules are cherry-picked above
      nursery: 'off',
      pedantic: 'warn',
      perf: 'warn',
      restriction: 'off',
      style: 'warn',
      suspicious: 'warn',
      ...categoryOverrides,
    },
    ignorePatterns,
    ...(jsPluginsSupported && { jsPlugins: resolveJsPlugins() }),
    options: { denyWarnings: true, typeAware: true, ...optionOverrides },
    overrides: [testOverride, ...targetOverrides, ...overrides],
    plugins: ['typescript', 'import', 'node', 'promise'],
    rules: jsPluginsSupported ? resolveRules(stylisticOptions) : ruleOverrides,
  });
};
