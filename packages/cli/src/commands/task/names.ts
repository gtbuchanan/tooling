/** CLI names for task subcommands. Keyed by import alias. */
export const taskNames = {
  compileTs: 'compile:ts',
  coverageCodecovUpload: 'coverage:codecov:upload',
  coverageVitestMerge: 'coverage:vitest:merge',
  deploySkills: 'deploy:skills',
  lintEslint: 'lint:eslint',
  packNpm: 'pack:npm',
  testVitest: 'test:vitest',
  testVitestE2e: 'test:vitest:e2e',
  testVitestFast: 'test:vitest:fast',
  testVitestSlow: 'test:vitest:slow',
  typecheckTs: 'typecheck:ts',
} as const;

/** Name of the root `task` subcommand hub. */
export const taskCommandName = 'task';
