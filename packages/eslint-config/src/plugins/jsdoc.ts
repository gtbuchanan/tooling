import type { Linter } from 'eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import type { PluginFactory } from '../index.ts';

// --- JSDoc ---

/*
 * HACK: eslint-plugin-jsdoc types declare flat configs as arrays,
 * but recommended-tsdoc is a single config object at runtime.
 * Extract plugins and rules explicitly to avoid spreading an
 * incorrectly-typed value.
 */
const tsdocConfig = jsdoc.configs['flat/recommended-tsdoc'] as unknown as Linter.Config;

const plugin: PluginFactory = () => [
  {
    files: ['**/*.ts'],
    plugins: tsdocConfig.plugins ?? {},
    rules: {
      ...tsdocConfig.rules,
      // Justification: @defaultValue is a standard TSDoc tag
      'jsdoc/check-tag-names': ['warn', { typed: true, definedTags: ['defaultValue'] }],
      // TODO: Enable once existing JSDoc blocks have @param descriptions
      'jsdoc/require-param': 'off',
      /*
       * Justification: TypeScript signatures already communicate the
       * return type — a @returns description rarely adds value beyond
       * what the type and function name convey.
       */
      'jsdoc/require-returns': 'off',
    },
  },
];

export default plugin;
