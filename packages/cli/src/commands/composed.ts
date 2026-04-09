import { type ParallelCommand, run, runParallel } from '../lib/process.ts';
import {
  testVitest,
  testVitestE2e,
  testVitestFast,
  testVitestSlow,
} from './leaf.ts';
import { pack } from './pack.ts';

const lintCommands: readonly ParallelCommand[] = [
  { command: 'oxlint', name: 'oxlint' },
  { command: 'eslint --max-warnings=0', name: 'eslint' },
];

const lintAndTestFastCommands: readonly ParallelCommand[] = [
  ...lintCommands,
  { command: 'vitest run --tags-filter=!slow', name: 'test' },
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

/*
 * Composed wrappers decouple the pipeline and command registry from
 * leaf-level tool names (e.g., testVitestFast). This lets the leaf
 * layer change tools without rippling through the pipeline.
 */

/** Runs fast source tests via Vitest (excludes tests tagged `slow`). */
export const testFast = async (): Promise<void> => {
  await testVitestFast([]);
};

/** Runs slow source tests via Vitest (only tests tagged `slow`). */
export const testSlow = async (): Promise<void> => {
  await testVitestSlow([]);
};

/** Runs all source tests in a single Vitest invocation for unified coverage. */
export const test = async (): Promise<void> => {
  await testVitest([]);
};

/** Runs end-to-end tests via Vitest with the e2e config. */
export const testE2e = async (): Promise<void> => {
  await testVitestE2e([]);
};

/** Compile, then lint + test:fast in parallel (no pack). */
export const check = async (): Promise<void> => {
  await compile();
  await runParallel(lintAndTestFastCommands);
};

/** Compile, lint + test:fast, then pack. */
export const buildCi = async (): Promise<void> => {
  await check();
  pack();
};

/** Full build pipeline: check → test:slow + pack → test:e2e. */
export const build = async (): Promise<void> => {
  await check();
  /*
   * Inline command strings because runParallel takes ParallelCommand
   * descriptors, not programmatic run() calls. Mirrors testVitestSlow.
   */
  await runParallel([
    { command: 'vitest run --tags-filter=slow --pass-with-no-tests', name: 'test:slow' },
    { command: 'gtb pack', name: 'pack' },
  ]);
  await testE2e();
};
