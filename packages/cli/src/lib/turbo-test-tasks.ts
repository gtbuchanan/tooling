import { taskNames } from '../commands/task/names.ts';
import {
  Aggregate,
  type ConditionalEntry,
  type ToolFlags,
  type TurboTask,
  topo,
} from './turbo-config.ts';

/*
 * Unlike compile inputs, test inputs can't be resolved from vitest config —
 * vitest configs are executable TypeScript, not statically parseable.
 * Broadening beyond test directories is intentional: tests import source.
 */
const testInputs = [
  'bin/**', 'src/**', 'test/**', 'scripts/**',
  'vitest.config.*', '!vitest.config.e2e.*',
];

/*
 * `^compile` rather than `^compile:ts`: the aggregate covers every compile
 * flavour a dependency might publish from (`compile:skills` today), where the
 * leaf names one toolchain. It still resolves to a no-op for a dependency that
 * compiles nothing.
 */
export const testTasks = (flags: ToolFlags): readonly ConditionalEntry<TurboTask>[] => {
  const deps = [...(flags.hasPublished ? [topo(Aggregate.compile)] : []), Aggregate.transit];

  return [
    {
      condition: flags.hasVitest,
      key: taskNames.testVitestFast,
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/fast/**', 'dist/test-results/vitest/merge/blob-fast.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: taskNames.testVitestSlow,
      value: {
        dependsOn: deps,
        env: ['CI'],
        inputs: testInputs,
        outputs: ['dist/coverage/vitest/slow/**', 'dist/test-results/vitest/merge/blob-slow.json'],
      },
    },
    {
      condition: flags.hasVitest,
      key: taskNames.coverageVitestMerge,
      value: {
        dependsOn: [taskNames.testVitestFast, taskNames.testVitestSlow],
        inputs: ['dist/test-results/vitest/merge/blob-*.json'],
        outputs: ['dist/coverage/vitest/merged/**'],
      },
    },
    /*
     * E2E tests read packed tarballs, but their own sources import fixture
     * helpers from source-only workspace packages, so they need `transit` too.
     * `^pack` looks like it already covers that — a dependency with no
     * `pack:npm` script leaves `pack` scriptless and inputs-less, so it hashes
     * the whole package exactly as `transit` does — but that is incidental: it
     * reaches direct dependencies only, and resolves to nothing at all when the
     * workspace packs nothing.
     */
    {
      condition: flags.hasE2e,
      key: taskNames.testVitestE2e,
      value: {
        dependsOn: [
          ...(flags.hasPublished ? [Aggregate.pack, topo(Aggregate.pack)] : []),
          Aggregate.transit,
        ],
        env: ['CI'],
        inputs: ['e2e/**', 'vitest.config.e2e.*'],
        outputs: ['dist/test-results/vitest/blob-e2e.json'],
      },
    },
  ];
};
