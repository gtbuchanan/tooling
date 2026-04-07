// @ts-check

/** @typedef {import('markdownlint').Configuration} Configuration */

import prettierStyle from 'markdownlint/style/prettier' with { type: 'json' };

/** @type {Readonly<Configuration>} */
const defaults = Object.freeze({
  ...prettierStyle,
  'single-trailing-newline': false,
});

/** @type {<T>(val: T) => T} */
const identity = val => val;

/**
 * Returns a markdownlint configuration that disables rules conflicting
 * with Prettier-style formatters (e.g. oxfmt). Pass an optional
 * transform to override individual rules.
 *
 * @param {(defaults: Readonly<Configuration>) => Configuration} [fn]
 * @returns {Configuration}
 */
export const configure = (fn = identity) => fn(defaults);
