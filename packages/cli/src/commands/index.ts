import {
  compileTs,
  coverageVitestMerge,
  lintEslint,
  lintOxlint,
  prepare,
  testVitest,
  testVitestE2e,
  testVitestFast,
  testVitestSlow,
  typecheckTs,
} from './leaf.ts';
import { pack, packNpm } from './pack.ts';
import { turboCheck } from './turbo-check.ts';
import { turboInit } from './turbo-init.ts';

/** Command registry mapping CLI names to handler functions. */
export const commands: Record<
  string,
  (args: readonly string[]) => Promise<void> | void
> = {
  'compile:ts': compileTs,
  'coverage:vitest:merge': coverageVitestMerge,
  'lint:eslint': lintEslint,
  'lint:oxlint': lintOxlint,
  'pack': () => { pack(); },
  'pack:npm': () => { packNpm(); },
  'prepare': prepare,
  'test:vitest': testVitest,
  'test:vitest:e2e': testVitestE2e,
  'test:vitest:fast': testVitestFast,
  'test:vitest:slow': testVitestSlow,
  'turbo:check': turboCheck,
  'turbo:init': turboInit,
  'typecheck:ts': typecheckTs,
};
