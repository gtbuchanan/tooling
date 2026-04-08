import { type ParallelCommand, run, runParallel } from '../lib/process.ts';
import { pack } from './pack.ts';

const lintCommands: readonly ParallelCommand[] = [
  { command: 'oxlint', name: 'oxlint' },
  { command: 'eslint --max-warnings=0', name: 'eslint' },
];

const lintAndTestCommands: readonly ParallelCommand[] = [
  ...lintCommands,
  { command: 'vitest run', name: 'test' },
];

/** Runs `tsc -b` followed by per-package compile scripts. */
export const compile = async (): Promise<void> => {
  await run('tsc', { args: ['-b'] });
  await run('pnpm', { args: ['-r', '--if-present', 'run', 'compile'] });
};

/** Runs oxlint and ESLint in parallel. */
export const lint = async (): Promise<void> => {
  await runParallel(lintCommands);
};

/** Runs unit tests via Vitest. */
export const test = async (): Promise<void> => {
  await run('vitest', { args: ['run'] });
};

/** Runs end-to-end tests via Vitest with the e2e config. */
export const testE2e = async (): Promise<void> => {
  await run('vitest', {
    args: ['run', '--config', 'vitest.config.e2e.ts'],
  });
};

/** Compile, then lint + test in parallel (no pack). */
export const check = async (): Promise<void> => {
  await compile();
  await runParallel(lintAndTestCommands);
};

/** Compile, lint + test in parallel, then pack. */
export const buildCi = async (): Promise<void> => {
  await check();
  pack();
};

/** Full build pipeline: build:ci then e2e tests. */
export const build = async (): Promise<void> => {
  await buildCi();
  await testE2e();
};
