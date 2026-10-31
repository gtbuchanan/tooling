import { Aggregate } from '#src/tasks/aggregates.js';
import { codegenDeps, rootSourceDeps } from '#src/tasks/edges.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { typecheckTsLeaf } from '#src/toolchains/typescript/leaves.js';

/*
 * Converts a pnpm workspace package glob into an ESLint/turbo ignore
 * pattern that matches files under any directory the glob resolves to.
 * `packages/*` → `packages/*​/**` (descendants of any direct subdir).
 */
const toPackageIgnore = (glob: string): string => `${glob}/**`;

/**
 * ESLint over the package's sources.
 *
 * The `transit` edge is declared rather than inherited through `typecheck:ts`:
 * that edge is optional (consumers may drop it for parallelism) and isn't
 * generated at all for a workspace without TypeScript, so relying on it would
 * make lint's cross-package invalidation silently conditional.
 */
export const lintEslintLeaf: Leaf = {
  aggregate: Aggregate.lint,
  appliesTo: pkg => pkg.hasEslint,
  name: 'lint:eslint',
  /*
   * Patterns use double quotes for cross-platform shell compatibility:
   * cmd.exe treats single quotes as literal characters (Windows pnpm
   * default), while both shells respect double quotes for arg grouping.
   *
   * `$TURBO_DEFAULT$` expands to root files minus gitignored paths
   * (dist/, node_modules/, .turbo/, .claude/worktrees/); only package
   * dirs need explicit subtraction since they're tracked but owned by
   * per-package lint. Cache file lives in the root cwd's dist/,
   * distinct from per-package caches that live in each package's dist/.
   */
  root: {
    args: ({ packageGlobs }) => [
      '.',
      ...packageGlobs.flatMap(glob => ['--ignore-pattern', `"${toPackageIgnore(glob)}"`]),
    ],
    appliesTo: discovery => discovery.root.hasEslint,
    task: graph => ({
      dependsOn: rootSourceDeps(graph),
      inputs: [
        '$TURBO_DEFAULT$',
        ...graph.discovery.packageGlobs.map(glob => `!${toPackageIgnore(glob)}`),
      ],
      outputs: ['dist/.eslintcache'],
    }),
  },
  task: graph => ({
    dependsOn: [
      ...codegenDeps(graph),
      ...(graph.applies(typecheckTsLeaf.name) ? [typecheckTsLeaf.name] : []),
      Aggregate.transit,
    ],
    inputs: [
      '$TURBO_ROOT$/eslint.config.*',
      'bin/**', 'src/**', 'test/**', 'e2e/**', 'scripts/**', 'skills/**',
      'eslint.config.*',
    ],
    outputs: ['dist/.eslintcache'],
  }),
};
