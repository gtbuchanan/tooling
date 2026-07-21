import { fileURLToPath } from 'node:url';
import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/**
 * The SARIF-writing formatter, resolved through the package's own export
 * map so the same specifier works from TS source (self-host) and the
 * compiled publish layout.
 */
const formatterPath = fileURLToPath(
  import.meta.resolve('@gtbuchanan/cli/eslint-sarif-formatter'),
);

/**
 * Runs ESLint as a reporter, not a gate: warnings never fail the task
 * (the repo convention downgrades every rule to a warning), while fatal
 * errors — parse or config breakage — still do. Enforcement lives in
 * the changed-files pre-commit step locally and in
 * `gtb sarif compare` (new-findings-only) in CI, so a baseline
 * SARIF log exists for every commit, including ones carrying accepted
 * violations.
 */
export const lintEslint = defineCommand({
  meta: {
    description: 'Run ESLint with caching, reporting to dist/eslint.sarif',
    name: 'lint:eslint',
  },
  run: async ({ rawArgs }) => {
    await run('eslint', {
      args: [
        '--cache', '--cache-location', 'dist/.eslintcache',
        '--format', formatterPath,
        ...rawArgs,
      ],
    });
  },
});
