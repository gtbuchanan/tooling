/**
 * Turbo-only aggregate task names (no CLI handler).
 */
export const Aggregate = {
  build: 'build',
  buildCi: 'build:ci',
  check: 'check',
  compile: 'compile',
  coverageMerge: 'coverage:merge',
  generate: 'generate',
  lint: 'lint',
  pack: 'pack',
  testE2e: 'test:e2e',
  testSlow: 'test:slow',
  transit: 'transit',
  typecheck: 'typecheck',
} as const;

/**
 * An aggregate a leaf can belong to. The rest have no leaf members: `build:ci`
 * lists other aggregates, `generate` the author's own scripts, and `transit`
 * only itself.
 */
export type AggregateName = Exclude<
  typeof Aggregate[keyof typeof Aggregate],
  typeof Aggregate.buildCi | typeof Aggregate.generate | typeof Aggregate.transit
>;
