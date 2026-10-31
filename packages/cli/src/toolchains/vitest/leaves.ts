import { Aggregate } from '#src/tasks/aggregates.js';
import { codegenDeps } from '#src/tasks/edges.js';
import type { Leaf, TaskGraph } from '#src/tasks/leaf.js';
import { topo } from '#src/tasks/turbo-task.js';
import { packNpmLeaf } from '#src/toolchains/npm/leaves.js';
import { compileTsLeaf } from '#src/toolchains/typescript/leaves.js';

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
  ...(graph.applies(compileTsLeaf.name) ? [topo(Aggregate.compile)] : []),
  ...codegenDeps(graph),
  Aggregate.transit,
];

/**
 * Vitest over the source tests not tagged `slow`.
 */
export const testVitestFastLeaf: Leaf = {
  aggregate: Aggregate.check,
  appliesTo: pkg => pkg.hasVitestTests,
  name: 'test:vitest:fast',
  task: graph => ({
    dependsOn: unitTestDeps(graph),
    env: ['CI'],
    inputs: testInputs,
    outputs: ['dist/coverage/vitest/fast/**', 'dist/test-results/vitest/merge/blob-fast.json'],
  }),
};

/**
 * Vitest over the source tests tagged `slow`.
 */
export const testVitestSlowLeaf: Leaf = {
  aggregate: Aggregate.testSlow,
  appliesTo: pkg => pkg.hasVitestTests,
  name: 'test:vitest:slow',
  task: graph => ({
    dependsOn: unitTestDeps(graph),
    env: ['CI'],
    inputs: testInputs,
    outputs: ['dist/coverage/vitest/slow/**', 'dist/test-results/vitest/merge/blob-slow.json'],
  }),
};

/**
 * Merges the fast and slow coverage reports into one.
 */
export const coverageVitestMergeLeaf: Leaf = {
  aggregate: Aggregate.coverageMerge,
  appliesTo: pkg => pkg.hasVitestTests,
  name: 'coverage:vitest:merge',
  task: () => ({
    dependsOn: [testVitestFastLeaf.name, testVitestSlowLeaf.name],
    inputs: ['dist/test-results/vitest/merge/blob-*.json'],
    outputs: ['dist/coverage/vitest/merged/**'],
  }),
};

/**
 * Vitest over the end-to-end tests, against the packed tarballs.
 *
 * E2E tests read packed tarballs, but their own sources import fixture
 * helpers from source-only workspace packages, so they need `transit` and
 * the codegen edges too: `^pack` orders no source-only dependency.
 * `^pack` looks like it already covers that — a dependency with no
 * `pack:npm` script leaves `pack` scriptless and inputs-less, so it hashes
 * the whole package exactly as `transit` does — but that is incidental: it
 * reaches direct dependencies only, and resolves to nothing at all when the
 * workspace packs nothing.
 */
export const testVitestE2eLeaf: Leaf = {
  aggregate: Aggregate.testE2e,
  appliesTo: pkg => pkg.hasVitestE2e,
  name: 'test:vitest:e2e',
  task: graph => ({
    dependsOn: [
      ...(graph.applies(packNpmLeaf.name) ? [Aggregate.pack, topo(Aggregate.pack)] : []),
      ...codegenDeps(graph),
      Aggregate.transit,
    ],
    env: ['CI'],
    inputs: ['e2e/**', 'vitest.config.e2e.*'],
    outputs: ['dist/test-results/vitest/blob-e2e.json'],
  }),
};
