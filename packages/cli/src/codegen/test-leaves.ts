import { codegenDeps } from '#src/codegen/leaf-edges.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import type { Leaf, TaskGraph } from '#src/tasks/leaf.js';
import { taskNames } from '#src/tasks/names.js';
import { topo } from '#src/tasks/turbo-task.js';

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
const unitTestDeps = (graph: TaskGraph): readonly string[] => [
  ...(graph.applies(taskNames.compileTs) ? [topo(Aggregate.compile)] : []),
  ...codegenDeps(graph),
  Aggregate.transit,
];

const testVitestFast: Leaf = {
  aggregate: Aggregate.check,
  appliesTo: pkg => pkg.hasVitestTests,
  name: taskNames.testVitestFast,
  task: graph => ({
    dependsOn: unitTestDeps(graph),
    env: ['CI'],
    inputs: testInputs,
    outputs: ['dist/coverage/vitest/fast/**', 'dist/test-results/vitest/merge/blob-fast.json'],
  }),
};

const testVitestSlow: Leaf = {
  aggregate: Aggregate.testSlow,
  appliesTo: pkg => pkg.hasVitestTests,
  name: taskNames.testVitestSlow,
  task: graph => ({
    dependsOn: unitTestDeps(graph),
    env: ['CI'],
    inputs: testInputs,
    outputs: ['dist/coverage/vitest/slow/**', 'dist/test-results/vitest/merge/blob-slow.json'],
  }),
};

const coverageVitestMerge: Leaf = {
  aggregate: Aggregate.coverageMerge,
  appliesTo: pkg => pkg.hasVitestTests,
  name: taskNames.coverageVitestMerge,
  task: () => ({
    dependsOn: [taskNames.testVitestFast, taskNames.testVitestSlow],
    inputs: ['dist/test-results/vitest/merge/blob-*.json'],
    outputs: ['dist/coverage/vitest/merged/**'],
  }),
};

/*
 * E2E tests read packed tarballs, but their own sources import fixture
 * helpers from source-only workspace packages, so they need `transit` and
 * the codegen edges too: `^pack` orders no source-only dependency.
 * `^pack` looks like it already covers that — a dependency with no
 * `pack:npm` script leaves `pack` scriptless and inputs-less, so it hashes
 * the whole package exactly as `transit` does — but that is incidental: it
 * reaches direct dependencies only, and resolves to nothing at all when the
 * workspace packs nothing.
 */
const testVitestE2e: Leaf = {
  aggregate: Aggregate.testE2e,
  appliesTo: pkg => pkg.hasVitestE2e,
  name: taskNames.testVitestE2e,
  task: graph => ({
    dependsOn: [
      ...(graph.applies(taskNames.packNpm) ? [Aggregate.pack, topo(Aggregate.pack)] : []),
      ...codegenDeps(graph),
      Aggregate.transit,
    ],
    env: ['CI'],
    inputs: ['e2e/**', 'vitest.config.e2e.*'],
    outputs: ['dist/test-results/vitest/blob-e2e.json'],
  }),
};

/*
 * No dependsOn — CI downloads coverage artifacts before running.
 *
 * Uncached on purpose. Caching on lcov content skipped the upload for every
 * package whose coverage hadn't moved, which left Codecov with no report for
 * that commit and therefore no commit status — and a required status check
 * that never reports blocks a pull request permanently. Uploading every time
 * is what makes the Codecov statuses dependable enough to gate on; the cost
 * is one CLI invocation per package per run.
 */
const coverageCodecovUpload: Leaf = {
  appliesTo: pkg => pkg.hasVitestTests,
  name: taskNames.coverageCodecovUpload,
  task: () => ({
    cache: false,
    env: ['CI', 'CODECOV_TOKEN'],
  }),
};

/**
 * The test and coverage leaves, in registry order.
 */
export const testLeaves: readonly Leaf[] = [
  testVitestFast,
  testVitestSlow,
  coverageVitestMerge,
  testVitestE2e,
  coverageCodecovUpload,
];
