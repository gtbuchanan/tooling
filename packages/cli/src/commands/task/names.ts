/** CLI names for task subcommands. Keyed by import alias. */
export const taskNames = {
  compileSkills: 'compile:skills',
  compileTs: 'compile:ts',
  coverageCodecovUpload: 'coverage:codecov:upload',
  coverageVitestMerge: 'coverage:vitest:merge',
  deploySkills: 'deploy:skills',
  lintEslint: 'lint:eslint',
  packNpm: 'pack:npm',
  packPkl: 'pack:pkl',
  testVitest: 'test:vitest',
  testVitestE2e: 'test:vitest:e2e',
  testVitestFast: 'test:vitest:fast',
  testVitestSlow: 'test:vitest:slow',
  typecheckPkl: 'typecheck:pkl',
  typecheckTs: 'typecheck:ts',
} as const;

/** Name of the root `task` subcommand hub. */
export const taskCommandName = 'task';
