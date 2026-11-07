import { describe, it } from 'vitest';
import { coverageInclude, defaultCoverageDirs, resolveCoverageInclude } from '#src/index.js';

describe.concurrent(resolveCoverageInclude, () => {
  it('returns default patterns without projects', ({ expect }) => {
    expect(resolveCoverageInclude()).toStrictEqual([...coverageInclude]);
  });

  it('includes per-project and root-level patterns', ({ expect }) => {
    const result = resolveCoverageInclude(['packages/*']);

    expect(result).toStrictEqual([
      ...coverageInclude.map(pattern => `packages/*/${pattern}`),
      ...coverageInclude,
    ]);
  });

  it('handles multiple project patterns', ({ expect }) => {
    const result = resolveCoverageInclude(['apps/*', 'libs/*']);

    expect(result).toStrictEqual([
      ...coverageInclude.map(pattern => `apps/*/${pattern}`),
      ...coverageInclude.map(pattern => `libs/*/${pattern}`),
      ...coverageInclude,
    ]);
  });

  it('respects custom coverage dirs', ({ expect }) => {
    const result = resolveCoverageInclude(undefined, ['src']);

    expect(result).toStrictEqual(['src/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}']);
  });

  it('includes all default dirs', ({ expect }) => {
    expect(defaultCoverageDirs).toStrictEqual(['bin', 'scripts', 'src']);
  });
});
