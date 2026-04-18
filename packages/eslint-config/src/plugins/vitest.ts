import vitestPlugin from '@vitest/eslint-plugin';
import type { PluginFactory } from '../index.ts';

// --- Vitest ---

/** File patterns for test files. */
const testFiles = ['**/test/**/*.ts', '**/e2e/**/*.ts'];

/** Vitest plugin configs with rule overrides for test files. */
const plugin: PluginFactory = () => [
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
      // Justification: Dynamic titles keep test names in sync with definitions
      'vitest/valid-title': 'off',
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

export default plugin;
