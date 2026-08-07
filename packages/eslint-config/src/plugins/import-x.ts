import type { Linter } from 'eslint';
import importPlugin, { createNodeResolver } from 'eslint-plugin-import-x';
import { scriptFiles } from '../files.ts';
import type { PluginFactory } from '../index.ts';

// --- import-x ---

/**
 * import-x recommended preset with rule overrides, plus ordering.
 *
 * `flatConfigs.typescript` is layered on top of `recommended` because the
 * plugin ships it for exactly this case: it retunes the preset for
 * TypeScript codebases.
 */
const recommendedConfig: Linter.Config = {
  ...importPlugin.flatConfigs.recommended,
  files: [...scriptFiles],
};

const typescriptConfig: Linter.Config = {
  ...importPlugin.flatConfigs.typescript,
  files: [...scriptFiles],
};

const overridesConfig: Linter.Config = {
  files: [...scriptFiles],
  rules: {
    /*
     * Justification: TypeScript reports every one of these itself, and each
     * forces full module resolution on every lint. `named` is already off
     * via the typescript config; the rest are not
     */
    'import-x/default': 'off',
    'import-x/export': 'off',
    'import-x/namespace': 'off',
    'import-x/no-unresolved': 'off',
    /*
     * Justification: Both flag the correct `import plugin from 'x'` then
     * `plugin.configs` idiom that ESLint plugins are consumed with, purely
     * because the module also exports that name. They resolve and parse
     * each imported module too, which in a workspace emits spurious
     * "Parse errors in imported module" on sibling packages
     */
    'import-x/no-named-as-default': 'off',
    'import-x/no-named-as-default-member': 'off',
    // Justification: Imports belong at the top; anything else hides load order
    'import-x/first': 'warn',
    // Justification: Separates the import block from the module body
    'import-x/newline-after-import': 'warn',
    /*
     * `no-anonymous-default-export` and `no-named-default` are deliberately
     * absent: unicorn's recommended preset already enables its own versions
     * of both, and enabling these too would double-report every violation
     */
    // Justification: An absolute path in an import is never portable
    'import-x/no-absolute-path': 'warn',
    // Justification: `import {} from 'x'` is a leftover that still runs side effects
    'import-x/no-empty-named-blocks': 'warn',
    /*
     * Justification: An import a package does not declare resolves only by
     * accident of layout — Node walks up to a parent `node_modules` — so it
     * breaks when the package moves, and leaves any version range the
     * dependency declares unenforced for that package
     */
    'import-x/no-extraneous-dependencies': 'warn',
    // Justification: A mutable export is a shared global by another name
    'import-x/no-mutable-exports': 'warn',
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

const plugin: PluginFactory = () => [
  recommendedConfig,
  typescriptConfig,
  overridesConfig,
];

export default plugin;
