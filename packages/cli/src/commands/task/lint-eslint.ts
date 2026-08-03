import { defineCommand } from 'citty';
import { executeLintEslint } from '../../lib/lint-eslint.ts';

/**
 * Runs ESLint via its programmatic API (see `lib/lint-eslint.ts` for
 * the reporter-not-gate semantics): one lint feeds both the SARIF log
 * consumed by `gtb sarif compare` and the stylish console report.
 * Enforcement lives in the changed-files pre-commit step locally and in
 * the compare (new-findings-only) in CI.
 */
export const lintEslint = defineCommand({
  meta: {
    description: 'Run ESLint with caching, reporting to dist/sarif/eslint.sarif',
    name: 'lint:eslint',
  },
  run: ({ rawArgs }) => executeLintEslint(rawArgs),
});
