import type { Linter } from 'eslint';
import importPlugin, { createNodeResolver } from 'eslint-plugin-import-x';
import { scriptFiles } from '../files.ts';
import type { PluginFactory } from '../index.ts';

// --- import-x (ordering + import hygiene) ---

/**
 * Import ordering and hygiene rules via eslint-plugin-import-x.
 *
 * The hygiene set is deliberately narrow. Excluded are the resolution-based
 * correctness rules (`no-unresolved`, `named`, `default`, `namespace`,
 * `export`) — TypeScript already reports every one of them, and they force
 * full module resolution on each lint — and the graph-walking rules
 * (`no-cycle`, `no-deprecated`, `no-unused-modules`), whose cost is not
 * yet justified. `no-commonjs` is excluded because a `.pnpmfile.cjs` is
 * required to be CommonJS, and `no-namespace` because `import * as build`
 * is an established convention here.
 */
const importConfig: Linter.Config = {
  files: [...scriptFiles],
  plugins: { 'import-x': importPlugin },
  rules: {
    // Justification: Imports belong at the top; anything else hides load order
    'import-x/first': 'warn',
    // Justification: Separates the import block from the module body
    'import-x/newline-after-import': 'warn',
    // Justification: An absolute path in an import is never portable
    'import-x/no-absolute-path': 'warn',
    // Justification: An unnamed default export is undebuggable in a stack trace
    'import-x/no-anonymous-default-export': 'warn',
    /*
     * Justification: Repeated imports of one module fragment its bindings and
     * silently drift apart -- one gets updated, the other is missed
     */
    'import-x/no-duplicates': 'warn',
    // Justification: `import {} from 'x'` is a leftover that still runs side effects
    'import-x/no-empty-named-blocks': 'warn',
    // Justification: A mutable export is a shared global by another name
    'import-x/no-mutable-exports': 'warn',
    // Justification: `import { default as x }` obscures a plain default import
    'import-x/no-named-default': 'warn',
    // Justification: A module importing itself is always a mistake
    'import-x/no-self-import': 'warn',
    // Justification: `./../x` is `../x` with extra steps
    'import-x/no-useless-path-segments': 'warn',
    // Justification: Case-insensitive alphabetical grouping by import type
    'import-x/order': [
      'warn', {
        'alphabetize': { caseInsensitive: true, order: 'asc' },
        'newlines-between': 'never',
        'pathGroups': [
          { group: 'parent', pattern: '#src/**', position: 'before' },
          { group: 'parent', pattern: '#test/**', position: 'before' },
        ],
        'pathGroupsExcludedImportTypes': ['builtin'],
      },
    ],
  },
  /*
   * Pin the bundled node resolver so we don't depend on the optional peer
   * `eslint-import-resolver-node` being kept in the install graph by pnpm.
   */
  settings: { 'import-x/resolver-next': [createNodeResolver()] },
};

const plugin: PluginFactory = () => [importConfig];

export default plugin;
