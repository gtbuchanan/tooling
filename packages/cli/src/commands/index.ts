import {
  build,
  buildCi,
  check,
  compile,
  lint,
  test,
  testE2e,
} from './composed.ts';
import {
  compileTs,
  lintEslint,
  lintOxlint,
  prepare,
  testVitest,
  testVitestE2e,
} from './leaf.ts';
import { pack } from './pack.ts';

/** Command registry mapping CLI names to handler functions. */
export const commands: Record<
  string,
  (args: readonly string[]) => Promise<void> | void
> = {
  build,
  'build:ci': buildCi,
  check,
  compile,
  'compile:ts': compileTs,
  lint,
  'lint:eslint': lintEslint,
  'lint:oxlint': lintOxlint,
  'pack': () => { pack(); },
  prepare,
  test,
  'test:e2e': testE2e,
  'test:vitest': testVitest,
  'test:vitest:e2e': testVitestE2e,
};
