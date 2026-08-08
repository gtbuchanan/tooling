import jsdoc from 'eslint-plugin-jsdoc';
import { tsOnlyFiles } from '../files.ts';
import type { PluginFactory } from '../index.ts';

// --- JSDoc ---

const tsdocConfig = jsdoc.configs['flat/recommended-tsdoc'];

const plugin: PluginFactory = () => [
  {
    files: [...tsOnlyFiles],
    plugins: tsdocConfig.plugins ?? {},
    rules: {
      ...tsdocConfig.rules,
      // Justification: @defaultValue is a standard TSDoc tag
      'jsdoc/check-tag-names': ['warn', { typed: true, definedTags: ['defaultValue'] }],
      /*
       * Justification: unicorn/single-line-block-comment-style deliberately
       * scopes itself to one-line vs. multi-line and leaves the asterisk
       * gutter to this plugin, so the two rules pair to produce standard
       * JSDoc.
       * https://github.com/sindresorhus/eslint-plugin-unicorn/issues/3603
       */
      'jsdoc/require-asterisk-prefix': 'warn',
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
